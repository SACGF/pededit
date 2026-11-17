import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import GitHubCallbackPage from "./pages/GitHubCallbackPage";
import CanvasPage from "./pages/CanvasPage";
import ChangelogPage from "./pages/ChangelogPage";
import { GoogleAuthProvider } from "./components/GoogleAuthProvider";
import GuidePage, { GuidesIndexPage } from "./pages/GuidePage";
import YourDataPage, { YOUR_DATA_PATH } from "./pages/YourDataPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      {/* The provider adds Google's script to the page, so it wraps the sign-in page only. */}
      <Route path="/login" element={<GoogleAuthProvider><LoginPage /></GoogleAuthProvider>} />
      <Route path="/auth/github/callback" element={<GitHubCallbackPage />} />
      <Route path="/changelog" element={<ChangelogPage />} />
      <Route path="/guides" element={<GuidesIndexPage />} />
      <Route path="/guides/:slug" element={<GuidePage />} />
      <Route path={YOUR_DATA_PATH} element={<YourDataPage />} />
      <Route path="/p/:id" element={<CanvasPage />} />
      {/* The same element as /p/:id, so saving an example's copy does not remount the editor. */}
      <Route path="/example/:slug" element={<CanvasPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
