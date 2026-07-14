import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Keeps a single render throw from blanking the whole atlas. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // surface it in dev so the pane console shows the real cause
    console.error("[atlas] render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot-error">
          <h1>oops, something tripped 🫠</h1>
          <p>the atlas hit a snag rendering. reloading usually fixes it.</p>
          <button className="card-link" onClick={() => window.location.reload()}>
            reload 🔄
          </button>
          {import.meta.env.DEV && (
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.5, marginTop: 16 }}>
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
