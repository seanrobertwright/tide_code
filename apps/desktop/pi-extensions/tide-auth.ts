import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Tide Auth Extension
 *
 * Exposes Pi's OAuth/subscription auth system as custom tools so the
 * Tide frontend can list providers, trigger login, and logout — all
 * via the existing RPC tool-call mechanism.
 */
export default function tideAuth(pi: ExtensionAPI) {
  // ── List OAuth providers + their login status ──────────────────────
  pi.registerTool({
    name: "tide_oauth_providers",
    label: "List OAuth Providers",
    description:
      "List available OAuth/subscription providers and their login status. " +
      "Used by Tide Settings UI. Do not call unless asked.",
    params: Type.Object({}),
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      const authStorage = ctx.modelRegistry.authStorage;
      const oauthProviders = authStorage.getOAuthProviders();

      const providers = oauthProviders.map((p) => ({
        id: p.id,
        name: p.name,
        loggedIn: authStorage.hasAuth(p.id),
      }));

      return {
        content: JSON.stringify(providers),
        details: providers as any,
      };
    },
  });

  // ── Login to an OAuth provider ─────────────────────────────────────
  pi.registerTool({
    name: "tide_oauth_login",
    label: "OAuth Login",
    description:
      "Start OAuth login flow for a subscription provider (e.g. openai-codex, " +
      "anthropic-max, copilot). Opens a browser for authentication. " +
      "Used by Tide Settings UI. Do not call unless asked.",
    params: Type.Object({
      provider_id: Type.String({ description: "OAuth provider ID to login to" }),
    }),
    execute: async (_toolCallId, params, signal, _onUpdate, ctx) => {
      const authStorage = ctx.modelRegistry.authStorage;
      const providers = authStorage.getOAuthProviders();
      const provider = providers.find((p) => p.id === params.provider_id);

      if (!provider) {
        const available = providers.map((p) => p.id).join(", ");
        return {
          content: `Unknown provider "${params.provider_id}". Available: ${available || "none"}`,
          details: { success: false, error: "unknown_provider" } as any,
        };
      }

      try {
        await authStorage.login(params.provider_id, {
          onAuth: (info) => {
            // Open the OAuth URL in the default browser
            import("node:child_process").then((cp) => {
              const openCmd = process.platform === 'win32' ? 'start ""' :
                              process.platform === 'darwin' ? 'open' : 'xdg-open';
              cp.exec(`${openCmd} "${info.url}"`);
            });
          },
          onPrompt: async (prompt) => {
            // Use Pi's extension UI to ask the user for input (e.g. paste callback URL)
            const result = await ctx.ui.input({
              title: prompt.message,
              placeholder: prompt.placeholder || "",
            });
            return result || "";
          },
          onProgress: (_message) => {
            // Progress updates — could emit via onUpdate but not critical
          },
          signal: signal || undefined,
        });

        return {
          content: `Successfully logged in to ${provider.name}.`,
          details: { success: true, provider: params.provider_id } as any,
        };
      } catch (err: any) {
        const message = err?.message || String(err);
        return {
          content: `Login failed: ${message}`,
          details: { success: false, error: message } as any,
        };
      }
    },
  });

  // ── Logout from an OAuth provider ──────────────────────────────────
  pi.registerTool({
    name: "tide_oauth_logout",
    label: "OAuth Logout",
    description:
      "Logout from an OAuth/subscription provider, removing stored credentials. " +
      "Used by Tide Settings UI. Do not call unless asked.",
    params: Type.Object({
      provider_id: Type.String({ description: "OAuth provider ID to logout from" }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const authStorage = ctx.modelRegistry.authStorage;

      try {
        authStorage.logout(params.provider_id);
        return {
          content: `Logged out from ${params.provider_id}.`,
          details: { success: true, provider: params.provider_id } as any,
        };
      } catch (err: any) {
        const message = err?.message || String(err);
        return {
          content: `Logout failed: ${message}`,
          details: { success: false, error: message } as any,
        };
      }
    },
  });
}
