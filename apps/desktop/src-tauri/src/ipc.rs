use serde_json::Value;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::process::{ChildStdin, ChildStdout};
use tokio::sync::{mpsc, Mutex};

/// Lightweight cloneable handle for sending commands to Pi.
/// Used by the orchestrator to send prompts without holding the main PiConnection lock.
#[derive(Clone)]
pub struct PiHandle {
    writer: Arc<Mutex<BufWriter<ChildStdin>>>,
}

impl PiHandle {
    /// Send a JSON command to Pi's stdin (one JSON object per line).
    pub async fn send(
        &self,
        cmd: &Value,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let json = serde_json::to_string(cmd)?;
        let mut writer = self.writer.lock().await;
        writer.write_all(json.as_bytes()).await?;
        writer.write_all(b"\n").await?;
        writer.flush().await?;
        Ok(())
    }
}

/// Connection to a Pi process via stdin/stdout JSON lines.
pub struct PiConnection {
    writer: Arc<Mutex<BufWriter<ChildStdin>>>,
    /// Receiver for ALL events from Pi's stdout.
    /// The setup code in lib.rs reads from this and emits Tauri events.
    pub event_rx: Arc<Mutex<mpsc::UnboundedReceiver<Value>>>,
}

impl PiConnection {
    /// Get a cloneable handle for sending commands without holding the connection lock.
    pub fn handle(&self) -> PiHandle {
        PiHandle {
            writer: self.writer.clone(),
        }
    }

    pub fn new(stdin: ChildStdin, stdout: ChildStdout) -> Self {
        let writer = Arc::new(Mutex::new(BufWriter::new(stdin)));
        let (event_tx, event_rx) = mpsc::unbounded_channel::<Value>();

        // Spawn stdout read loop
        tokio::spawn(async move {
            Self::read_loop(stdout, event_tx).await;
        });

        Self {
            writer,
            event_rx: Arc::new(Mutex::new(event_rx)),
        }
    }

    /// Send a JSON command to Pi's stdin (one JSON object per line).
    pub async fn send(
        &self,
        cmd: &Value,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let json = serde_json::to_string(cmd)?;
        let mut writer = self.writer.lock().await;
        writer.write_all(json.as_bytes()).await?;
        writer.write_all(b"\n").await?;
        writer.flush().await?;
        Ok(())
    }

    /// Read JSON lines from Pi's stdout and forward to the event channel.
    async fn read_loop(stdout: ChildStdout, tx: mpsc::UnboundedSender<Value>) {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        loop {
            match lines.next_line().await {
                Ok(Some(line)) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    match serde_json::from_str::<Value>(trimmed) {
                        Ok(val) => {
                            let event_type = val
                                .get("type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("unknown");

                            // Log model-related events at debug level for diagnostics
                            if event_type == "model_select" || event_type.contains("model") {
                                tracing::debug!("Pi event [model]: {} — {:?}", event_type,
                                    val.as_object().map(|o| o.keys().collect::<Vec<_>>()).unwrap_or_default());
                            } else {
                                tracing::trace!("Pi event: {} (keys: {:?})", event_type,
                                    val.as_object().map(|o| o.keys().collect::<Vec<_>>()).unwrap_or_default());
                            }

                            if tx.send(val).is_err() {
                                tracing::info!("Pi event channel closed");
                                break;
                            }
                        }
                        Err(e) => {
                            tracing::warn!("Failed to parse Pi output: {} — line: {}", e, &trimmed[..trimmed.len().min(200)]);
                        }
                    }
                }
                Ok(None) => {
                    tracing::info!("Pi stdout closed (process exited)");
                    break;
                }
                Err(e) => {
                    tracing::error!("Pi stdout read error: {}", e);
                    break;
                }
            }
        }
    }
}
