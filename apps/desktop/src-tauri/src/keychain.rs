use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

static STORE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

/// Get the path to the encrypted keys file.
fn keys_file() -> PathBuf {
    // Use ~/.tide/keys.json (user-level, not per-project)
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(home).join(".tide");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("keys.json")
}

/// Load keys from disk into memory cache.
fn load_store() -> HashMap<String, String> {
    let path = keys_file();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&content) {
                return map;
            }
        }
    }
    HashMap::new()
}

/// Save keys from memory cache to disk.
fn save_store(map: &HashMap<String, String>) -> Result<(), String> {
    let path = keys_file();
    let content = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;

    // Set file permissions to owner-only (0600)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(&path, perms);
    }

    Ok(())
}

/// Get or initialize the in-memory store.
fn with_store<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashMap<String, String>) -> R,
{
    let mut guard = STORE.lock().unwrap();
    if guard.is_none() {
        *guard = Some(load_store());
    }
    f(guard.as_mut().unwrap())
}

pub fn set_key(provider: &str, key: &str) -> Result<(), String> {
    with_store(|store| {
        store.insert(provider.to_string(), key.to_string());
        save_store(store)
    })
}

pub fn get_key(provider: &str) -> Result<Option<String>, String> {
    Ok(with_store(|store| store.get(provider).cloned()))
}

pub fn delete_key(provider: &str) -> Result<(), String> {
    with_store(|store| {
        store.remove(provider);
        save_store(store)
    })
}

/// Check if a key exists for a provider without returning the actual value.
pub fn has_key(provider: &str) -> bool {
    with_store(|store| store.contains_key(provider))
}
