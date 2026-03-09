import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.fallbackLabel ?? "Component"} crashed:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <p style={styles.title}>{this.props.fallbackLabel ?? "Something"} crashed</p>
            <p style={styles.message}>{this.state.error?.message}</p>
            <button
              style={styles.button}
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    width: "100%",
    background: "var(--bg-primary)",
  },
  content: {
    textAlign: "center",
    padding: 24,
    maxWidth: 400,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: "0 0 8px 0",
  },
  message: {
    fontSize: 12,
    color: "var(--text-secondary)",
    margin: "0 0 16px 0",
    wordBreak: "break-word",
  },
  button: {
    padding: "6px 16px",
    fontSize: 12,
    color: "var(--text-bright)",
    background: "var(--bg-tertiary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  },
};
