import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleAuthProvider } from "./components/GoogleAuthProvider.tsx";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.DEV) {
  // Exposes window.__pededit for agent page checks; stripped from production builds.
  void import("./devHooks");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GoogleAuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GoogleAuthProvider>
  </StrictMode>
);
