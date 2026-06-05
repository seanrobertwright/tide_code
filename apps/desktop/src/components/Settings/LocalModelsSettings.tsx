import { useEffect, useState } from "react";
import {
  readPiModelsJson,
  writePiLocalProvider,
  removePiProvider,
  detectOllama,
  type PiModelsJson,
  type PiApiType,
} from "../../lib/ipc";

const API_OPTIONS: { value: PiApiType; label: string }[] = [
  { value: "openai-completions", label: "OpenAI Chat Completions (most compatible)" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
  { value: "google-generative-ai", label: "Google Generative AI" },
];

const OLLAMA_NATIVE = "http://localhost:11434";
const OLLAMA_OPENAI_BASE = "http://localhost:11434/v1";

interface ManualForm {
  providerId: string;
  baseUrl: string;
  api: PiApiType;
  apiKey: string;
  modelsText: string;
  noDeveloperRole: boolean;
  noReasoningEffort: boolean;
}

const EMPTY_FORM: ManualForm = {
  providerId: "",
  baseUrl: "",
  api: "openai-completions",
  apiKey: "",
  modelsText: "",
  noDeveloperRole: false,
  noReasoningEffort: false,
};

/**
 * Manage local / OpenAI-compatible model providers (Ollama, LM Studio, vLLM, proxies).
 * Writes ~/.pi/agent/models.json via the backend; Pi picks the models up on restart and
 * they then appear in the model picker and router. `onChanged` flags the parent's
 * "restart to apply" banner.
 */
export function LocalModelsSettings({ onChanged }: { onChanged: () => void }) {
  const [providers, setProviders] = useState<NonNullable<PiModelsJson["providers"]>>({});
  const [loading, setLoading] = useState(true);

  const [ollamaState, setOllamaState] = useState<"idle" | "probing" | "found" | "error">("idle");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaError, setOllamaError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const data = await readPiModelsJson();
      setProviders(data.providers ?? {});
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const probeOllama = async () => {
    setOllamaState("probing");
    setOllamaError("");
    try {
      const models = await detectOllama(OLLAMA_NATIVE);
      setOllamaModels(models);
      setOllamaState("found");
    } catch (e) {
      setOllamaError(String(e));
      setOllamaState("error");
    }
  };

  const addOllama = async () => {
    if (ollamaModels.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await writePiLocalProvider({
        providerId: "ollama",
        baseUrl: OLLAMA_OPENAI_BASE,
        api: "openai-completions",
        apiKey: "ollama",
        models: ollamaModels,
      });
      onChanged();
      await load();
      setOllamaState("idle");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveManual = async () => {
    const id = form.providerId.trim();
    const models = form.modelsText
      .split(/[\n,]/)
      .map((m) => m.trim())
      .filter(Boolean);
    if (!id || !form.baseUrl.trim() || models.length === 0) {
      setError("Provider id, base URL, and at least one model id are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await writePiLocalProvider({
        providerId: id,
        baseUrl: form.baseUrl.trim(),
        api: form.api,
        apiKey: form.apiKey.trim() || undefined,
        models,
        supportsDeveloperRole: form.noDeveloperRole ? false : undefined,
        supportsReasoningEffort: form.noReasoningEffort ? false : undefined,
      });
      onChanged();
      await load();
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await removePiProvider(id);
      onChanged();
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const providerEntries = Object.entries(providers);

  return (
    <div>
      <h3 style={{ ...s.heading, marginTop: 24 }}>Local &amp; Custom Models</h3>
      <p style={s.description}>
        Run models locally (Ollama, LM Studio, vLLM) or point at any OpenAI-compatible
        endpoint. Saved to <code style={s.inlineCode}>~/.pi/agent/models.json</code>; restart
        the agent to load them into the model picker.
      </p>

      {error && <div style={s.errorBox}>{error}</div>}

      {/* Ollama quick setup */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div>
            <span style={s.providerName}>Ollama</span>
            <span style={s.subDescription}>Auto-detect models running on this machine</span>
          </div>
          <button style={s.actionBtn} onClick={probeOllama} disabled={ollamaState === "probing" || busy}>
            {ollamaState === "probing" ? "Detecting…" : "Detect Ollama"}
          </button>
        </div>

        {ollamaState === "error" && (
          <div style={s.hint}>
            {ollamaError || "Ollama not reachable."} Make sure Ollama is running (
            <code style={s.inlineCode}>ollama serve</code>) and that you have pulled at least one
            model (<code style={s.inlineCode}>ollama pull qwen2.5-coder:7b</code>).
          </div>
        )}

        {ollamaState === "found" && (
          ollamaModels.length > 0 ? (
            <div style={s.foundBox}>
              <div style={s.foundList}>
                {ollamaModels.map((m) => (
                  <span key={m} style={s.modelChip}>{m}</span>
                ))}
              </div>
              <button style={s.saveBtn} onClick={addOllama} disabled={busy}>
                Add {ollamaModels.length} model{ollamaModels.length === 1 ? "" : "s"}
              </button>
            </div>
          ) : (
            <div style={s.hint}>
              Ollama is running but no models are installed. Pull one first, e.g.{" "}
              <code style={s.inlineCode}>ollama pull qwen2.5-coder:7b</code>.
            </div>
          )
        )}
      </div>

      {/* Existing custom providers */}
      {!loading && providerEntries.length > 0 && (
        <div style={s.list}>
          {providerEntries.map(([id, cfg]) => (
            <div key={id} style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <span style={s.providerName}>{id}</span>
                  <span style={s.subDescription}>
                    {cfg.api || "?"} · {(cfg.models?.length ?? 0)} model
                    {(cfg.models?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
                <button style={s.deleteBtn} onClick={() => remove(id)} disabled={busy}>
                  Remove
                </button>
              </div>
              {cfg.baseUrl && <div style={s.metaLine}>{cfg.baseUrl}</div>}
              {cfg.models && cfg.models.length > 0 && (
                <div style={s.foundList}>
                  {cfg.models.map((m) => (
                    <span key={m.id} style={s.modelChip}>{m.id}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manual add */}
      {showForm ? (
        <div style={s.card}>
          <div style={s.formGrid}>
            <label style={s.label}>Provider id</label>
            <input
              style={s.input}
              placeholder="lmstudio"
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
            />
            <label style={s.label}>Base URL</label>
            <input
              style={s.input}
              placeholder="http://localhost:1234/v1"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            />
            <label style={s.label}>API</label>
            <select
              style={s.input}
              value={form.api}
              onChange={(e) => setForm({ ...form, api: e.target.value as PiApiType })}
            >
              {API_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label style={s.label}>API key</label>
            <input
              style={s.input}
              placeholder="optional — leave blank for local servers"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
            <label style={s.label}>Model ids</label>
            <textarea
              style={{ ...s.input, minHeight: 54, resize: "vertical", fontFamily: "var(--font-mono)" }}
              placeholder="one per line or comma-separated&#10;qwen2.5-coder:7b&#10;llama3.1:8b"
              value={form.modelsText}
              onChange={(e) => setForm({ ...form, modelsText: e.target.value })}
            />
          </div>

          <div style={s.compatRow}>
            <label style={s.checkLabel}>
              <input
                type="checkbox"
                checked={form.noDeveloperRole}
                onChange={(e) => setForm({ ...form, noDeveloperRole: e.target.checked })}
              />
              Server doesn't support the <code style={s.inlineCode}>developer</code> role
            </label>
            <label style={s.checkLabel}>
              <input
                type="checkbox"
                checked={form.noReasoningEffort}
                onChange={(e) => setForm({ ...form, noReasoningEffort: e.target.checked })}
              />
              Server doesn't support <code style={s.inlineCode}>reasoning_effort</code>
            </label>
          </div>

          <div style={s.actionRow}>
            <button style={s.saveBtn} onClick={saveManual} disabled={busy}>Save</button>
            <button style={s.cancelBtn} onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(""); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button style={{ ...s.actionBtn, marginTop: 8 }} onClick={() => setShowForm(true)}>
          + Add custom endpoint
        </button>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  heading: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-md)", fontWeight: 600, color: "var(--text-bright)", margin: "0 0 4px" },
  description: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 },
  list: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  card: { display: "flex", flexDirection: "column", gap: 8, padding: 12, marginTop: 8, backgroundColor: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border, rgba(86, 95, 137, 0.2))" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  providerName: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-bright)", marginRight: 8 },
  subDescription: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" },
  metaLine: { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" },
  actionRow: { display: "flex", gap: 8 },
  actionBtn: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", fontWeight: 500, padding: "5px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: "1px solid var(--border, rgba(86, 95, 137, 0.3))", color: "var(--text-primary)", backgroundColor: "var(--bg-tertiary)" },
  saveBtn: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", fontWeight: 500, padding: "5px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: "none", color: "#fff", backgroundColor: "var(--accent)" },
  cancelBtn: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", fontWeight: 500, padding: "5px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: "1px solid var(--border, rgba(86, 95, 137, 0.3))", color: "var(--text-secondary)", backgroundColor: "transparent" },
  deleteBtn: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", fontWeight: 500, padding: "5px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", border: "1px solid var(--error, #e06c75)", color: "var(--error, #e06c75)", backgroundColor: "transparent" },
  input: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-sm)", padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border, rgba(86, 95, 137, 0.3))", backgroundColor: "var(--bg-primary)", color: "var(--text-primary)", width: "100%", boxSizing: "border-box" },
  formGrid: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, alignItems: "center" },
  label: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" },
  compatRow: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 },
  checkLabel: { display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--text-primary)" },
  foundBox: { display: "flex", flexDirection: "column", gap: 8 },
  foundList: { display: "flex", flexWrap: "wrap", gap: 4 },
  modelChip: { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", backgroundColor: "var(--bg-tertiary)", padding: "2px 8px", borderRadius: "var(--radius-sm)" },
  hint: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.5 },
  errorBox: { fontFamily: "var(--font-ui)", fontSize: "var(--font-size-xs)", color: "var(--error, #e06c75)", backgroundColor: "rgba(224, 108, 117, 0.12)", padding: "6px 10px", borderRadius: "var(--radius-sm)", marginBottom: 8 },
  inlineCode: { fontFamily: "var(--font-mono)", fontSize: "0.92em", backgroundColor: "var(--bg-tertiary)", padding: "1px 4px", borderRadius: 3 },
};
