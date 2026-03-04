use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};

const SERVICE_NAME: &str = "dev.tide.ide";

pub fn set_key(provider: &str, key: &str) -> Result<(), String> {
    set_generic_password(SERVICE_NAME, provider, key.as_bytes()).map_err(|e| e.to_string())
}

pub fn get_key(provider: &str) -> Result<Option<String>, String> {
    match get_generic_password(SERVICE_NAME, provider) {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).to_string())),
        Err(e) => {
            // errSecItemNotFound = -25300
            let desc = e.to_string();
            if desc.contains("-25300") || desc.contains("not found") || desc.contains("NotFound") {
                Ok(None)
            } else {
                Err(desc)
            }
        }
    }
}

pub fn delete_key(provider: &str) -> Result<(), String> {
    delete_generic_password(SERVICE_NAME, provider).map_err(|e| e.to_string())
}

/// Check if a key exists for a provider without returning the actual value.
pub fn has_key(provider: &str) -> bool {
    matches!(get_key(provider), Ok(Some(_)))
}
