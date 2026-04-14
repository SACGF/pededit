import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GOOGLE_CLIENT_ID, GITHUB_CLIENT_ID } from "../config";

type CredentialResponse = { credential?: string };

export default function LoginPage() {
  const { login, googleLogin } = useAppStore();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch {
      setError("Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = useCallback(
    async (response: CredentialResponse) => {
      if (!response.credential) {
        setError("Google sign-in failed.");
        return;
      }
      setError(null);
      setLoading(true);
      try {
        await googleLogin(response.credential);
        navigate("/", { replace: true });
      } catch {
        setError("Google sign-in failed.");
      } finally {
        setLoading(false);
      }
    },
    [googleLogin, navigate]
  );

  const handleGitHub = () => {
    if (!GITHUB_CLIENT_ID) {
      setError("GitHub sign-in is not configured.");
      return;
    }
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: `${window.location.origin}/auth/github/callback`,
      scope: "read:user user:email",
    });
    window.location.href = `https://github.com/login/oauth/authorize?${params}`;
  };

  const hasSocial = !!(GOOGLE_CLIENT_ID || GITHUB_CLIENT_ID);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">
            &larr; Back
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Social buttons */}
          <div className="space-y-2">
            {GOOGLE_CLIENT_ID && (
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError("Google sign-in failed.")}
                  width="336"
                  text="continue_with"
                  shape="rectangular"
                  theme="outline"
                />
              </div>
            )}
            {GITHUB_CLIENT_ID && (
              <GitHubButton onClick={handleGitHub} disabled={loading} />
            )}
          </div>

          {hasSocial && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">or</span>
              </div>
            </div>
          )}

          {/* Password login — collapsed by default when social is available */}
          {hasSocial && !showPassword ? (
            <button
              type="button"
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
              onClick={() => setShowPassword(true)}
            >
              Sign in with username &amp; password
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in\u2026" : "Sign in"}
              </Button>
            </form>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ── GitHub button ───────────────────────────────────────────────────────────

function GitHubButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-2 border rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
      Continue with GitHub
    </button>
  );
}
