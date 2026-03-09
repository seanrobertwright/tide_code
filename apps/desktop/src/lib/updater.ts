import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Check for updates on app start. If an update is available,
 * the Tauri updater dialog handles the UX (configured in tauri.conf.json).
 * This function is a no-op in dev mode or when the updater isn't configured.
 */
export async function checkForUpdates(silent = true): Promise<void> {
  try {
    const update = await check();
    if (!update) return;

    console.log(`[updater] Update available: v${update.version}`);

    if (!silent) {
      // Manual check — download and install immediately
      await update.downloadAndInstall();
      await relaunch();
    }
    // When silent=true and dialog=true in config, Tauri shows its own dialog
  } catch (err) {
    // Silently ignore updater errors (offline, no endpoint, dev mode, etc.)
    console.debug("[updater] Check failed (expected in dev):", err);
  }
}
