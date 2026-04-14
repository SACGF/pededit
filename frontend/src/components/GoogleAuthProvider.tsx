import type { ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { GOOGLE_CLIENT_ID } from "../config";

/**
 * Wraps children with GoogleOAuthProvider only when VITE_GOOGLE_CLIENT_ID is
 * configured. When the env var is absent the real package is never loaded
 * (vite.config.ts aliases it to a no-op stub in that case).
 */
export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  if (!GOOGLE_CLIENT_ID) return <>{children}</>;
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {children}
    </GoogleOAuthProvider>
  );
}
