import type { ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { GuideLayout } from "../guides/GuideLayout";
import { GUIDES, guideBySlug, guidePath } from "../guides/guides";
import { SymbolsGuide } from "../guides/SymbolsGuide";
import { HowToDrawGuide } from "../guides/HowToDrawGuide";
import { ConsanguinityGuide } from "../guides/ConsanguinityGuide";
import { PracticeFamiliesGuide } from "../guides/PracticeFamiliesGuide";

const BODIES: Record<string, ReactNode> = {
  "pedigree-symbols": <SymbolsGuide />,
  "how-to-draw-a-pedigree": <HowToDrawGuide />,
  "consanguinity": <ConsanguinityGuide />,
  "practice-families": <PracticeFamiliesGuide />,
};

/** /guides/<slug>: one of the static guides (#202). */
export default function GuidePage() {
  const { slug } = useParams();
  const guide = guideBySlug(slug);
  const body = guide && BODIES[guide.slug];
  if (!guide || !body) return <Navigate to="/guides" replace />;
  return (
    <GuideLayout title={guide.title} intro={guide.description} current={guide.slug}>
      {body}
    </GuideLayout>
  );
}

/** /guides: the list of guides. */
export function GuidesIndexPage() {
  return (
    <GuideLayout title="Pedigree guides" intro="Short guides to drawing clinical pedigrees with the standard NSGC symbols. Every figure is drawn by PedEdit.">
      <ul className="space-y-4">
        {GUIDES.map(g => (
          <li key={g.slug}>
            <Link to={guidePath(g.slug)} className="font-medium text-black underline underline-offset-2">{g.title}</Link>
            <p className="text-sm text-gray-600 mt-0.5">{g.description}</p>
          </li>
        ))}
      </ul>
    </GuideLayout>
  );
}
