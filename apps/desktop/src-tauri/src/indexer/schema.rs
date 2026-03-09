use rusqlite::Connection;

pub fn create_tables(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS repos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            root_path   TEXT NOT NULL UNIQUE,
            last_indexed_at TEXT,
            file_count  INTEGER DEFAULT 0,
            symbol_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS files (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id      INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
            rel_path     TEXT NOT NULL,
            language     TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            line_count   INTEGER DEFAULT 0,
            byte_size    INTEGER DEFAULT 0,
            indexed_at   TEXT NOT NULL,
            UNIQUE(repo_id, rel_path)
        );

        CREATE TABLE IF NOT EXISTS symbols (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id          INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            symbol_id        TEXT NOT NULL,
            name             TEXT NOT NULL,
            qualified_name   TEXT NOT NULL,
            kind             TEXT NOT NULL,
            start_line       INTEGER NOT NULL,
            end_line         INTEGER NOT NULL,
            start_col        INTEGER NOT NULL,
            end_col          INTEGER NOT NULL,
            signature        TEXT,
            docstring        TEXT,
            parent_symbol_id TEXT,
            visibility       TEXT,
            is_exported      INTEGER DEFAULT 0,
            body_hash        TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
        CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
        CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
        CREATE INDEX IF NOT EXISTS idx_symbols_qualified ON symbols(qualified_name);
        CREATE INDEX IF NOT EXISTS idx_symbols_symbol_id ON symbols(symbol_id);
        CREATE INDEX IF NOT EXISTS idx_files_repo ON files(repo_id);
        CREATE INDEX IF NOT EXISTS idx_files_path ON files(repo_id, rel_path);
        ",
    )?;

    // FTS5 virtual table for symbol search
    // We create this separately since CREATE VIRTUAL TABLE doesn't support IF NOT EXISTS
    // in all SQLite versions the same way
    let has_fts: bool = conn
        .query_row(
            "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='symbols_fts'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if !has_fts {
        conn.execute_batch(
            "
            CREATE VIRTUAL TABLE symbols_fts USING fts5(
                name, qualified_name, signature, docstring,
                content=symbols, content_rowid=id
            );
            ",
        )?;
    }

    // Triggers to keep FTS in sync
    conn.execute_batch(
        "
        CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
            INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring)
            VALUES (new.id, new.name, new.qualified_name, new.signature, new.docstring);
        END;

        CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
            INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring)
            VALUES ('delete', old.id, old.name, old.qualified_name, old.signature, old.docstring);
        END;

        CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
            INSERT INTO symbols_fts(symbols_fts, rowid, name, qualified_name, signature, docstring)
            VALUES ('delete', old.id, old.name, old.qualified_name, old.signature, old.docstring);
            INSERT INTO symbols_fts(rowid, name, qualified_name, signature, docstring)
            VALUES (new.id, new.name, new.qualified_name, new.signature, new.docstring);
        END;
        ",
    )?;

    Ok(())
}
