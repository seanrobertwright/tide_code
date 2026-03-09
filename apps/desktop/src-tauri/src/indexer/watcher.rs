use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::mpsc;

use crate::indexer::parser::SupportedLanguage;

pub struct IndexWatcher {
    _watcher: RecommendedWatcher,
}

pub enum WatchEvent {
    Changed(PathBuf),
    Removed(PathBuf),
}

impl IndexWatcher {
    pub fn new(
        root: PathBuf,
        tx: mpsc::UnboundedSender<WatchEvent>,
    ) -> Result<Self, notify::Error> {
        let tx = Arc::new(tx);
        let tx_clone = tx.clone();

        let mut watcher = notify::recommended_watcher(move |result: Result<Event, _>| {
            if let Ok(event) = result {
                for path in &event.paths {
                    // Only care about supported file extensions
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("");
                    if SupportedLanguage::from_extension(ext).is_none() {
                        continue;
                    }

                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) => {
                            let _ = tx_clone.send(WatchEvent::Changed(path.clone()));
                        }
                        EventKind::Remove(_) => {
                            let _ = tx_clone.send(WatchEvent::Removed(path.clone()));
                        }
                        _ => {}
                    }
                }
            }
        })?;

        watcher.watch(&root, RecursiveMode::Recursive)?;

        Ok(IndexWatcher {
            _watcher: watcher,
        })
    }
}
