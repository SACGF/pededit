/**
 * The landing page as static HTML (#25), so search engines and assistants
 * that do not run JavaScript read what PedEdit is. `prerenderLandingPlugin`
 * in vite.config.ts writes it into dist/index.html after a build. The page
 * is drawn for a first visit: signed out, nothing in "Recent on this
 * device". `main.tsx` renders the app over it, so it is never hydrated and
 * may differ from what the app then draws.
 */
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import LandingPage from "./pages/LandingPage";

export function renderLanding(): string {
  return renderToString(
    <StaticRouter location="/">
      <LandingPage />
    </StaticRouter>,
  );
}
