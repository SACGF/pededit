import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";

export default function GitHubCallbackPage() {
  const [searchParams] = useSearchParams();
  const githubLogin = useAppStore((s) => s.githubLogin);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = searchParams.get("code");
    if (!code) {
      setError("Missing authorization code from GitHub.");
      return;
    }

    githubLogin(code)
      .then(() => navigate("/", { replace: true }))
      .catch(() => setError("GitHub sign-in failed. Please try again."));
  }, [searchParams, githubLogin, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500 mb-4">{error}</p>
          <button
            className="text-xs text-gray-500 hover:text-gray-700 underline"
            onClick={() => navigate("/login")}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-gray-500">Signing in with GitHub&hellip;</p>
    </div>
  );
}
