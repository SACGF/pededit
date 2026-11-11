import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import GitHubCallbackPage from "./pages/GitHubCallbackPage";
import CanvasPage from "./pages/CanvasPage";
import ChangelogPage from "./pages/ChangelogPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/github/callback" element={<GitHubCallbackPage />} />
      <Route path="/changelog" element={<ChangelogPage />} />
      <Route path="/p/:id" element={<CanvasPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
