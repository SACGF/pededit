import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { exampleBySlug, type ExamplePedigree } from "../data/examples";
import { rateLimitMessage } from "../api/errors";

/**
 * Copies being created, by slug. React StrictMode runs an effect twice on
 * mount in development; both runs share the one request, so a visit makes
 * one pedigree.
 */
const creating = new Map<string, Promise<string>>();

function createCopy(ex: ExamplePedigree): Promise<string> {
  let copy = creating.get(ex.slug);
  if (!copy) {
    copy = useAppStore.getState().createPedigreeFromData(ex.label, ex.data)
      .finally(() => creating.delete(ex.slug));
    creating.set(ex.slug, copy);
  }
  return copy;
}

/**
 * /example/<slug> (#150): saves the example as the visitor's own pedigree
 * and opens it. Every visit makes a new copy, so two visitors never share
 * one. An unknown slug goes to the landing page.
 */
export default function ExamplePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const example = exampleBySlug(slug);
  // null while the copy is being made; the rate limit's wait (#184) or "" when it failed otherwise.
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!example) return;
    let left = false;
    createCopy(example).then(
      // replace: Back from the editor must not return here and make another copy.
      id => { if (!left) navigate(`/p/${id}`, { replace: true }); },
      err => { if (!left) setFailed(rateLimitMessage(err) ?? ""); },
    );
    return () => { left = true; };
  }, [example, navigate]);

  if (!example) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-8">
      {failed !== null ? (
        <p className="text-xs text-gray-500" role="alert">
          Could not open {example.label}. {failed || "Check your connection and reload."} Or go to the{" "}
          <Link to="/" className="text-black underline underline-offset-2">home page</Link>.
        </p>
      ) : (
        <p className="text-xs text-gray-400">Opening {example.label}…</p>
      )}
    </div>
  );
}
