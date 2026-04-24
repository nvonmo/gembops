import { createRoot } from "react-dom/client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import App from "./App";
import "./index.css";

type StartupGuardState = { hasError: boolean };

class StartupGuard extends Component<{ children: ReactNode }, StartupGuardState> {
  state: StartupGuardState = { hasError: false };

  static getDerivedStateFromError(): StartupGuardState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[startup-guard] render failure", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">No se pudo iniciar la app</h1>
            <p className="text-sm text-muted-foreground">
              Intenta cerrar y volver a abrir la app. Si el problema persiste, recarga desde el navegador.
            </p>
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  console.error("[startup-guard] uncaught error", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[startup-guard] unhandled rejection", event.reason);
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root container #root not found");
}

createRoot(rootEl).render(
  <StartupGuard>
    <App />
  </StartupGuard>
);
