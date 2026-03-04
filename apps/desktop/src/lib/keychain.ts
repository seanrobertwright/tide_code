import { invoke } from "@tauri-apps/api/core";

export async function keychainSetKey(provider: string, key: string): Promise<void> {
  await invoke("keychain_set_key", { provider, key });
}

export async function keychainGetKey(provider: string): Promise<string | null> {
  return invoke<string | null>("keychain_get_key", { provider });
}

export async function keychainDeleteKey(provider: string): Promise<void> {
  await invoke("keychain_delete_key", { provider });
}

export async function keychainHasKey(provider: string): Promise<boolean> {
  return invoke<boolean>("keychain_has_key", { provider });
}
