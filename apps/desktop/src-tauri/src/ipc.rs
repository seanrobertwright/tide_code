use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::process::{ChildStdin, ChildStdout};
use tokio::sync::{mpsc, Mutex, oneshot};

/// Map of pending request IDs to their response channels.
pub type PendingRequests = Arc<Mutex<HashMap<String, oneshot::Sender<Value>>>>;

/// Lightweight cloneable handle for sending commands to Pi.
/// Used by the orchestrator to send prompts without holding the main PiConnection lock.
#[derive(Clone)]
pub struct PiHandle {
    writer: Arc<Mutex<BufWriter<ChildStdin>>>,
    pending: PendingRequests,
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

    /// Send a JSON command with a unique `id` for response correlation.
    /// Returns a receiver that will yield the matching `response` from Pi.
    pub async fn send_with_id(
        &self,
        cmd: &mut Value,
    ) -> Result<oneshot::Receiver<Value>, Box<dyn std::error::Error + Send + Sync>> {
        let id = uuid::Uuid::new_v4().to_string();
        cmd.as_object_mut()
            .ok_or("Command must be a JSON object")?
            .insert("id".to_string(), Value::String(id.clone()));

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id.clone(), tx);

        self.send(cmd).await?;

        // Spawn cleanup task: remove entry after 60s if no response arrived
        let pending = self.pending.clone();
        let cleanup_id = id;
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            let mut map = pending.lock().await;
            if map.remove(&cleanup_id).is_some() {
                tracing::warn!("Cleaned up stale pending request: {}", cleanup_id);
            }
        });

        Ok(rx)
    }
}

/// Connection to a Pi process via stdin/stdout JSON lines.
pub struct PiConnection {
    writer: Arc<Mutex<BufWriter<ChildStdin>>>,
    /// Receiver for ALL events from Pi's stdout.
    /// The setup code in lib.rs reads from this and emits Tauri events.
    pub event_rx: Arc<Mutex<mpsc::UnboundedReceiver<Value>>>,
    /// Shared pending requests map for response correlation.
    pub pending: PendingRequests,
}

impl PiConnection {
    /// Get a cloneable handle for sending commands without holding the connection lock.
    pub fn handle(&self) -> PiHandle {
        PiHandle {
            writer: self.writer.clone(),
            pending: self.pending.clone(),
        }
    }

    pub fn new(stdin: ChildStdin, stdout: ChildStdout) -> Self {
        let writer = Arc::new(Mutex::new(BufWriter::new(stdin)));
        let (event_tx, event_rx) = mpsc::unbounded_channel::<Value>();
        let pending: PendingRequests = Arc::new(Mutex::new(HashMap::new()));

        // Spawn stdout read loop
        tokio::spawn(async move {
            Self::read_loop(stdout, event_tx).await;
        });

        Self {
            writer,
            event_rx: Arc::new(Mutex::new(event_rx)),
            pending,
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
