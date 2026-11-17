import { Component, type ErrorInfo, type ReactNode } from "react";
import { errorReportingOn, reportError } from "../errorReporting";

const ISSUES_URL = "https://github.com/SACGF/pededit/issues";

/**
 * The app's only error boundary: without one a render error leaves a
 * blank white page. It replaces the whole app, so the page that failed is
 * unmounted, which is when `CanvasPage` saves unsaved edits.
 *
 * The message shown here stays in the browser. What is reported, when
 * reporting is on, is decided by `errorReporting/scrub.ts`.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error("Unknown error") };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportError(error, { mechanism: "react", componentStack: info.componentStack });
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return (
      <div className="min-h-screen bg-white flex flex-col" role="alert" data-testid="error-boundary">
        <header className="border-b px-8 py-4">
          <a href="/" className="text-base font-medium tracking-tight">PedEdit</a>
        </header>
        <main className="flex-1 px-8 py-12">
          <div className="w-full max-w-lg mx-auto">
            <h2 className="text-sm font-medium mb-2">Something went wrong</h2>
            <p className="text-xs text-gray-600 mb-4">
              PedEdit hit an error it could not recover from. Changes are saved as you make them, so
              reloading the page should bring your pedigree back as it was.
            </p>
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="border border-black bg-black text-white text-xs px-3 py-1.5"
              >
                Reload the page
              </button>
              <a href="/" className="border border-gray-300 text-xs px-3 py-1.5">Go to the start page</a>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              {errorReportingOn
                ? "An error report was sent to the PedEdit developers. It holds the kind of error and where in the code it happened, and nothing from your pedigree."
                : "No error report was sent."}{" "}
              If it keeps happening, please{" "}
              <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                report it on GitHub
              </a>{" "}
              with the text below.
            </p>
            <pre className="text-xs text-gray-500 border border-gray-200 p-2 whitespace-pre-wrap break-words">{message}</pre>
          </div>
        </main>
      </div>
    );
  }
}
