/**
 * No-op stub for @react-oauth/google.
 * Used via vite alias when the package is not installed (local dev without Google auth).
 */
import type { ReactNode } from "react";

export function GoogleOAuthProvider({
  children,
}: {
  clientId: string;
  children: ReactNode;
}) {
  return <>{children}</>;
}

export function GoogleLogin(_props: unknown) {
  return null;
}

export type CredentialResponse = { credential?: string };
