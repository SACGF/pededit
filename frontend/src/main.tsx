import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleAuthProvider } from "./components/GoogleAuthProvider.tsx";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { initErrorReporting } from "./errorReporting";
import "./index.css";

if (import.meta.env.DEV) {
  // Exposes window.__pededit for agent page checks; stripped from production builds.
  void import("./devHooks");
}

// Does nothing unless the build was given a Rollbar access token.
initErrorReporting();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GoogleAuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </GoogleAuthProvider>
  </StrictMode>
);
