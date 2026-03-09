import { useUiStore } from "../stores/ui";

export function GlobalLoader() {
  const { isLoading, loadingMessage } = useUiStore();
  if (!isLoading) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.content}>
        <div style={styles.spinner} />
        {loadingMessage && <p style={styles.message}>{loadingMessage}</p>}
      </div>
      <style>{keyframes}</style>
    </div>
  );
}

const keyframes = `
@keyframes tide-spin {
  to { transform: rotate(360deg); }
}
`;

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.45)",
    backdropFilter: "blur(2px)",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid var(--border)",
    borderTopColor: "var(--accent)",
    borderRadius: "50%",
    animation: "tide-spin 0.8s linear infinite",
  },
  message: {
    color: "var(--text-primary)",
    fontSize: "var(--font-size-md)",
    margin: 0,
  },
};
