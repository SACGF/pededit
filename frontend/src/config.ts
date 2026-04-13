/**
 * Runtime configuration.
 *
 * In production the values are injected at build time via VITE_ env vars.
 * For local dev, create a frontend/.env.local with:
 *   VITE_GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
 *   VITE_GITHUB_CLIENT_ID=your-github-client-id
 */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
export const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID ?? "";
