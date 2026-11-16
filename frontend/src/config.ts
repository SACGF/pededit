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
 * Error reporting to Rollbar (#49, `errorReporting/`). Empty means off:
 * nothing is loaded or sent. `deploy.sh` sets it from
 * `rollbar_client_access_token` (post_client_item) in the site config. The
 * dev server never reports, whatever the environment says.
 */
export const ROLLBAR_ACCESS_TOKEN: string = import.meta.env.PROD ? (import.meta.env.VITE_ROLLBAR_ACCESS_TOKEN ?? "") : "";
export const ROLLBAR_ENVIRONMENT: string = import.meta.env.VITE_ROLLBAR_ENVIRONMENT || "production";
