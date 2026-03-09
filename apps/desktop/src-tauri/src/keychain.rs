use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Directory that holds Tide user-level config/data.
fn tide_dir() -> PathBuf {
    let dir = crate::tide_home_dir().join(".tide");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

// ===========================================================================
// macOS / Linux – plain JSON file (unchanged behaviour)
// ===========================================================================

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    static STORE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

    fn keys_file() -> PathBuf {
        tide_dir().join("keys.json")
    }

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

    pub fn has_key(provider: &str) -> bool {
        with_store(|store| store.contains_key(provider))
    }
}

// ===========================================================================
// Windows – Windows Credential Manager via the `keyring` crate
// ===========================================================================
//
// Secret values are stored in Windows Credential Manager.
// Because the Credential Manager API does not support listing all credentials
// for a given service, we maintain a lightweight JSON index file that tracks
// which provider names have been stored. The index contains *only names*, never
// secret values.
// ===========================================================================

#[cfg(target_os = "windows")]
mod platform {
    use super::*;

    const SERVICE_NAME: &str = "tide";

    /// Path to the key-name index (no secrets stored here).
    fn index_file() -> PathBuf {
        tide_dir().join("key_index.json")
    }

    // -- Index helpers -------------------------------------------------------

    fn load_index() -> Vec<String> {
        let path = index_file();
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(names) = serde_json::from_str::<Vec<String>>(&content) {
                    return names;
                }
            }
        }
        Vec::new()
    }

    fn save_index(names: &[String]) -> Result<(), String> {
        let path = index_file();
        let content = serde_json::to_string_pretty(names).map_err(|e| e.to_string())?;
        std::fs::write(&path, content).map_err(|e| e.to_string())
    }

    fn add_to_index(provider: &str) -> Result<(), String> {
        let mut names = load_index();
        if !names.iter().any(|n| n == provider) {
            names.push(provider.to_string());
            save_index(&names)?;
        }
        Ok(())
    }

    fn remove_from_index(provider: &str) -> Result<(), String> {
        let mut names = load_index();
        names.retain(|n| n != provider);
        save_index(&names)
    }

    // -- Credential Manager wrappers -----------------------------------------

    fn entry_for(provider: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE_NAME, provider).map_err(|e| e.to_string())
    }

    pub fn set_key(provider: &str, key: &str) -> Result<(), String> {
        let entry = entry_for(provider)?;
        entry.set_password(key).map_err(|e| format!("credential store: {e}"))?;
        add_to_index(provider)
    }

    pub fn get_key(provider: &str) -> Result<Option<String>, String> {
        let entry = entry_for(provider)?;
        match entry.get_password() {
            Ok(val) => Ok(Some(val)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("credential store: {e}")),
        }
    }

    pub fn delete_key(provider: &str) -> Result<(), String> {
        let entry = entry_for(provider)?;
        match entry.delete_credential() {
            Ok(()) => {}
            Err(keyring::Error::NoEntry) => {} // already gone – not an error
            Err(e) => return Err(format!("credential store: {e}")),
        }
        remove_from_index(provider)
    }

    pub fn has_key(provider: &str) -> bool {
        match entry_for(provider) {
            Ok(entry) => matches!(entry.get_password(), Ok(_)),
            Err(_) => false,
        }
    }
}

// ===========================================================================
// Public API – delegates to the platform module
// ===========================================================================

pub fn set_key(provider: &str, key: &str) -> Result<(), String> {
    platform::set_key(provider, key)
}

pub fn get_key(provider: &str) -> Result<Option<String>, String> {
    platform::get_key(provider)
}

pub fn delete_key(provider: &str) -> Result<(), String> {
    platform::delete_key(provider)
}

pub fn has_key(provider: &str) -> bool {
    platform::has_key(provider)
}
