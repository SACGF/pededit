import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { tolerateForeignDomEdits } from "./domGuard";
import { initErrorReporting } from "./errorReporting";
import "./index.css";

if (import.meta.env.DEV) {
  // Exposes window.__pededit for agent page checks; stripped from production builds.
  void import("./devHooks");
}

// Does nothing unless the build was given a Rollbar access token.
initErrorReporting();

// Before the first render: page translation must not be able to crash the app.
tolerateForeignDomEdits();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>
);
