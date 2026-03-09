pub mod parser;
pub mod query;
pub mod schema;
pub mod symbols;
pub mod watcher;

use parser::SupportedLanguage;
use rusqlite::Connection;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{mpsc, Mutex};
use xxhash_rust::xxh3::xxh3_64;

pub struct IndexerState {
    db: Arc<Mutex<Connection>>,
    watcher_handle: Arc<Mutex<Option<watcher::IndexWatcher>>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IndexStats {
    pub indexed: bool,
    pub file_count: u32,
    pub symbol_count: u32,
    pub last_indexed_at: Option<String>,
    pub indexing_in_progress: bool,
}

impl IndexerState {
    pub fn new(workspace_root: &str) -> Result<Self, String> {
        let tide_dir = Path::new(workspace_root).join(".tide");
        std::fs::create_dir_all(&tide_dir).map_err(|e| format!("Failed to create .tide dir: {}", e))?;

        let db_path = tide_dir.join("index.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open index.db: {}", e))?;

        // Enable WAL mode for concurrent reads
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        schema::create_tables(&conn)
            .map_err(|e| format!("Failed to create tables: {}", e))?;

        Ok(IndexerState {
            db: Arc::new(Mutex::new(conn)),
            watcher_handle: Arc::new(Mutex::new(None)),
        })
    }
}

fn get_or_create_repo(conn: &Connection, root_path: &str) -> rusqlite::Result<i64> {
    // Try to find existing
    match conn.query_row(
        "SELECT id FROM repos WHERE root_path = ?1",
        [root_path],
        |row| row.get::<_, i64>(0),
    ) {
        Ok(id) => Ok(id),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            conn.execute(
                "INSERT INTO repos (root_path) VALUES (?1)",
                [root_path],
            )?;
            Ok(conn.last_insert_rowid())
        }
        Err(e) => Err(e),
    }
}

fn index_single_file(
    conn: &Connection,
    repo_id: i64,
    workspace_root: &Path,
    file_path: &Path,
) -> Result<(u32, bool), String> {
    let rel_path = file_path
        .strip_prefix(workspace_root)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let language = match SupportedLanguage::from_extension(ext) {
        Some(l) => l,
        None => return Ok((0, false)),
    };

    let source = std::fs::read(file_path).map_err(|e| e.to_string())?;
    let hash = format!("{:016x}", xxh3_64(&source));

    // Check if file already indexed with same hash
    let existing_hash: Option<String> = conn
        .query_row(
            "SELECT content_hash FROM files WHERE repo_id = ?1 AND rel_path = ?2",
            rusqlite::params![repo_id, &rel_path],
            |row| row.get(0),
        )
        .ok();

    if existing_hash.as_deref() == Some(hash.as_str()) {
        return Ok((0, false)); // No change
    }

    // Parse symbols
    let raw_symbols = parser::parse_file(language, &source)?;
    let line_count = source.iter().filter(|&&b| b == b'\n').count() as u32 + 1;
    let byte_size = source.len() as u32;
    let now = chrono_now();

    // Delete old file entry (CASCADE deletes symbols)
    conn.execute(
        "DELETE FROM files WHERE repo_id = ?1 AND rel_path = ?2",
        rusqlite::params![repo_id, &rel_path],
    )
    .map_err(|e| e.to_string())?;

    // Insert file
    conn.execute(
        "INSERT INTO files (repo_id, rel_path, language, content_hash, line_count, byte_size, indexed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            repo_id,
            &rel_path,
            language.as_str(),
            &hash,
            line_count,
            byte_size,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    let file_id = conn.last_insert_rowid();

    // Insert symbols
    let mut stmt = conn
        .prepare(
            "INSERT INTO symbols (file_id, symbol_id, name, qualified_name, kind,
             start_line, end_line, start_col, end_col, signature, docstring,
             parent_symbol_id, visibility, is_exported, body_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )
        .map_err(|e| e.to_string())?;

    for sym in &raw_symbols {
        let symbol_id = format!(
            "{}::{}#{}",
            rel_path,
            sym.qualified_name,
            sym.kind.as_str()
        );
        let parent_sid = sym.parent.as_ref().map(|p| format!("{}::{}#class", rel_path, p));

        stmt.execute(rusqlite::params![
            file_id,
            &symbol_id,
            &sym.name,
            &sym.qualified_name,
            sym.kind.as_str(),
            sym.start_line,
            sym.end_line,
            sym.start_col,
            sym.end_col,
            &sym.signature,
            &sym.docstring,
            &parent_sid,
            &sym.visibility,
            sym.is_exported as i32,
            Option::<String>::None,
        ])
        .map_err(|e| e.to_string())?;
    }

    Ok((raw_symbols.len() as u32, true))
}

fn chrono_now() -> String {
    // Simple ISO8601 timestamp without chrono dependency
    use std::time::SystemTime;
    let duration = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Approximate ISO format: just use unix timestamp for simplicity
    format!("{}", secs)
}

pub async fn index_workspace(
    indexer: &IndexerState,
    workspace_root: &str,
    app_handle: Option<&tauri::AppHandle>,
) -> Result<IndexStats, String> {
    let db = indexer.db.lock().await;
    let repo_id = get_or_create_repo(&db, workspace_root).map_err(|e| e.to_string())?;

    let root = PathBuf::from(workspace_root);

    // Walk workspace using ignore crate (respects .gitignore)
    let walker = ignore::WalkBuilder::new(&root)
        .hidden(true) // skip hidden files
        .git_ignore(true)
        .git_global(true)
        .build();

    let mut files_to_index: Vec<PathBuf> = Vec::new();
    for entry in walker {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if SupportedLanguage::from_extension(ext).is_some() {
            files_to_index.push(path.to_path_buf());
        }
    }

    let total = files_to_index.len();
    let mut total_symbols = 0u32;
    let mut indexed_files = 0u32;

    for (i, file_path) in files_to_index.iter().enumerate() {
        match index_single_file(&db, repo_id, &root, file_path) {
            Ok((sym_count, _changed)) => {
                total_symbols += sym_count;
                indexed_files += 1;
            }
            Err(e) => {
                tracing::warn!("Failed to index {}: {}", file_path.display(), e);
            }
        }

        // Emit progress
        if let Some(handle) = app_handle {
            if i % 10 == 0 || i == total - 1 {
                let _ = handle.emit(
                    "index_progress",
                    serde_json::json!({
                        "done": i + 1,
                        "total": total,
                        "currentFile": file_path.file_name().and_then(|n| n.to_str()).unwrap_or(""),
                    }),
                );
            }
        }
    }

    // Update repo stats
    let now = chrono_now();
    db.execute(
        "UPDATE repos SET last_indexed_at = ?1, file_count = ?2, symbol_count = ?3 WHERE id = ?4",
        rusqlite::params![&now, indexed_files, total_symbols, repo_id],
    )
    .map_err(|e| e.to_string())?;

    // Get actual counts from DB (includes previously indexed unchanged files)
    let file_count: u32 = db
        .query_row(
            "SELECT COUNT(*) FROM files WHERE repo_id = ?1",
            [repo_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let symbol_count: u32 = db
        .query_row(
            "SELECT COUNT(*) FROM symbols s JOIN files f ON s.file_id = f.id WHERE f.repo_id = ?1",
            [repo_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(IndexStats {
        indexed: true,
        file_count,
        symbol_count,
        last_indexed_at: Some(now),
        indexing_in_progress: false,
    })
}

pub async fn start_watcher(
    indexer: &IndexerState,
    workspace_root: &str,
) -> Result<(), String> {
    let root = PathBuf::from(workspace_root);
    let (tx, mut rx) = mpsc::unbounded_channel::<watcher::WatchEvent>();

    let w = watcher::IndexWatcher::new(root.clone(), tx)
        .map_err(|e| format!("Failed to start watcher: {}", e))?;

    {
        let mut handle = indexer.watcher_handle.lock().await;
        *handle = Some(w);
    }

    // Spawn debounced event processor
    let db = indexer.db.clone();
    let workspace = workspace_root.to_string();
    tokio::spawn(async move {
        let mut pending: Vec<watcher::WatchEvent> = Vec::new();
        loop {
            // Collect events with 300ms debounce
            tokio::select! {
                Some(event) = rx.recv() => {
                    pending.push(event);
                    // Drain any additional events that arrived
                    while let Ok(e) = rx.try_recv() {
                        pending.push(e);
                    }
                    // Wait for debounce period
                    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                    // Drain again after sleep
                    while let Ok(e) = rx.try_recv() {
                        pending.push(e);
                    }

                    // Process all pending events
                    let conn = db.lock().await;
                    let repo_id = match get_or_create_repo(&conn, &workspace) {
                        Ok(id) => id,
                        Err(e) => {
                            tracing::error!("Watcher: failed to get repo: {}", e);
                            pending.clear();
                            continue;
                        }
                    };

                    for event in pending.drain(..) {
                        match event {
                            watcher::WatchEvent::Changed(path) => {
                                if let Err(e) = index_single_file(&conn, repo_id, &root, &path) {
                                    tracing::warn!("Watcher: failed to index {}: {}", path.display(), e);
                                } else {
                                    tracing::debug!("Watcher: re-indexed {}", path.display());
                                }
                            }
                            watcher::WatchEvent::Removed(path) => {
                                let rel_path = path
                                    .strip_prefix(&root)
                                    .map(|p| p.to_string_lossy().to_string())
                                    .unwrap_or_default();
                                let _ = conn.execute(
                                    "DELETE FROM files WHERE repo_id = ?1 AND rel_path = ?2",
                                    rusqlite::params![repo_id, &rel_path],
                                );
                                tracing::debug!("Watcher: removed {}", rel_path);
                            }
                        }
                    }
                }
                else => break,
            }
        }
    });

    Ok(())
}

// ── Tauri Commands ──────────────────────────────────────────

#[tauri::command]
pub async fn index_workspace_cmd(
    state: tauri::State<'_, crate::AppState>,
) -> Result<IndexStats, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;

    let indexer_guard = state.indexer.lock().await;
    let indexer = indexer_guard.as_ref().ok_or("Indexer not initialized")?;

    index_workspace(indexer, workspace, None).await
}

#[tauri::command]
pub async fn index_file_tree(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<query::FileNode>, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;

    let indexer_guard = state.indexer.lock().await;
    let indexer = indexer_guard.as_ref().ok_or("Indexer not initialized")?;

    let db = indexer.db.lock().await;
    let repo_id = get_or_create_repo(&db, workspace).map_err(|e| e.to_string())?;
    query::get_file_tree(&db, repo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn index_file_outline(
    state: tauri::State<'_, crate::AppState>,
    rel_path: String,
) -> Result<Vec<query::SymbolOutline>, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;

    let indexer_guard = state.indexer.lock().await;
    let indexer = indexer_guard.as_ref().ok_or("Indexer not initialized")?;

    let db = indexer.db.lock().await;
    let repo_id = get_or_create_repo(&db, workspace).map_err(|e| e.to_string())?;
    query::get_file_outline(&db, repo_id, &rel_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn index_get_symbol(
    state: tauri::State<'_, crate::AppState>,
    symbol_id: String,
) -> Result<Option<query::SymbolDetail>, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;

    let indexer_guard = state.indexer.lock().await;
    let indexer = indexer_guard.as_ref().ok_or("Indexer not initialized")?;

    let db = indexer.db.lock().await;
    query::get_symbol(&db, workspace, &symbol_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn index_search_symbols(
    state: tauri::State<'_, crate::AppState>,
    query_str: String,
    kind: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<query::SymbolOutline>, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;

    let indexer_guard = state.indexer.lock().await;
    let indexer = indexer_guard.as_ref().ok_or("Indexer not initialized")?;

    let db = indexer.db.lock().await;
    let repo_id = get_or_create_repo(&db, workspace).map_err(|e| e.to_string())?;
    query::search_symbols(
        &db,
        repo_id,
        &query_str,
        kind.as_deref(),
        limit.unwrap_or(20),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn index_repo_outline(
    state: tauri::State<'_, crate::AppState>,
) -> Result<query::RepoOutline, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;

    let indexer_guard = state.indexer.lock().await;
    let indexer = indexer_guard.as_ref().ok_or("Indexer not initialized")?;

    let db = indexer.db.lock().await;
    let repo_id = get_or_create_repo(&db, workspace).map_err(|e| e.to_string())?;
    query::get_repo_outline(&db, repo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn index_status(
    state: tauri::State<'_, crate::AppState>,
) -> Result<IndexStats, String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;

    let indexer_guard = state.indexer.lock().await;
    let indexer = match indexer_guard.as_ref() {
        Some(i) => i,
        None => {
            return Ok(IndexStats {
                indexed: false,
                file_count: 0,
                symbol_count: 0,
                last_indexed_at: None,
                indexing_in_progress: false,
            });
        }
    };

    let db = indexer.db.lock().await;
    let result = db.query_row(
        "SELECT file_count, symbol_count, last_indexed_at FROM repos WHERE root_path = ?1",
        [workspace],
        |row| {
            Ok(IndexStats {
                indexed: true,
                file_count: row.get(0)?,
                symbol_count: row.get(1)?,
                last_indexed_at: row.get(2)?,
                indexing_in_progress: false,
            })
        },
    );

    match result {
        Ok(stats) => Ok(stats),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(IndexStats {
            indexed: false,
            file_count: 0,
            symbol_count: 0,
            last_indexed_at: None,
            indexing_in_progress: false,
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn index_invalidate(
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    let root = state.workspace_root.lock().await;
    let workspace = root.as_deref().ok_or("No workspace open")?;

    let indexer_guard = state.indexer.lock().await;
    let indexer = indexer_guard.as_ref().ok_or("Indexer not initialized")?;

    let db = indexer.db.lock().await;
    db.execute("DELETE FROM repos WHERE root_path = ?1", [workspace])
        .map_err(|e| e.to_string())?;

    Ok(())
}
