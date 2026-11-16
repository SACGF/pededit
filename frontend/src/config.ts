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

/**
 * Error reporting (#49, `errorReporting/`). Empty means off: nothing is loaded
 * or sent. `deploy.sh` sets it from `sentry_frontend_dsn` in the site config.
 * The dev server never reports, whatever the environment says.
 */
export const SENTRY_DSN: string = import.meta.env.PROD ? (import.meta.env.VITE_SENTRY_DSN ?? "") : "";
export const SENTRY_ENVIRONMENT: string = import.meta.env.VITE_SENTRY_ENVIRONMENT || "production";
