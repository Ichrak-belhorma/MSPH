import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { getConfigError } from "./config.js";
import "./styles/global.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

/**
 * A production build with no `VITE_API_BASE_URL` baked in (see
 * config.ts's doc comment) is a build/deployment mistake, not a runtime
 * network error — it should never reach the login screen only to fail
 * every request with a confusing "Server unreachable". Checked once here,
 * before anything else renders, so the *first* thing the user (or, more
 * likely, whoever built the installer) sees is a plain, specific message
 * naming exactly what's missing — not a blank window, not a network-error
 * toast that looks like a connectivity problem on their end.
 */
const configError = getConfigError();

if (configError) {
  root.render(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 32,
        fontFamily: "system-ui, sans-serif",
        background: "#1a1d21",
        color: "#f5f5f5",
      }}
    >
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>Erreur de configuration</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#c9cdd3" }}>{configError.message}</p>
      </div>
    </div>,
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
