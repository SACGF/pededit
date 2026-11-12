import { useState } from "react";
import { Panel } from "@xyflow/react";
import { usePedigreeStore } from "../store/usePedigreeStore";
import type { Pedigree } from "@pedigree-editor/layout-engine";
import { setParentsProblem } from "./parents";
import { linkPartnerProblem } from "./partners";

function nameOf(pedigree: Pedigree, id: string): string {
  const ind = pedigree.individuals.find(i => i.id === id);
  if (!ind) return id;
  const name = ind.name?.trim();
  if (name) return name;
  const sex = ind.sex === "male" ? "male" : ind.sex === "female" ? "female" : "unknown sex";
  return `unnamed (${sex})`;
}

/**
 * Instructions, the picks so far and a name search while on-canvas picking
 * (#36, and #84 for a partner) is active. Sits over the canvas as a React Flow panel.
 */
export function PickingBanner() {
  const { pedigree, picking, pickIndividual, applyPicking, cancelPicking } = usePedigreeStore();
  const [query, setQuery] = useState("");
  if (!picking) return null;

  const isParents = picking.kind === "parents";
  const picked = isParents ? picking.picked : [];
  const isPartner = picking.kind === "partner";
  const excluded = new Set(isParents ? [picking.childId, ...picked]
    : picking.kind === "partner" || picking.kind === "relatedness" ? [picking.individualId] : []);
  const q = query.trim().toLowerCase();
  const matches = q
    ? pedigree.individuals
      .filter(i => !excluded.has(i.id) && ((i.name ?? "").toLowerCase().includes(q) || i.id.toLowerCase().includes(q)))
      .filter(i => !isParents || !setParentsProblem(pedigree, picking.childId, [...picked, i.id]))
      .filter(i => !isPartner || !linkPartnerProblem(pedigree, picking.individualId, i.id))
      .slice(0, 8)
    : [];

  const partnership = picking.kind === "child" ? pedigree.partnerships.find(p => p.id === picking.partnershipId) : undefined;
  const heading = isParents
    ? `Click one or two people to be the parents of ${nameOf(pedigree, picking.childId)}`
    : isPartner
      ? `Click a person already on the tree to be the partner of ${nameOf(pedigree, picking.individualId)}`
    : picking.kind === "relatedness"
      ? `Click a person to see how they are related to ${nameOf(pedigree, picking.individualId)}`
    : partnership
      ? `Click a person to make them a child of ${nameOf(pedigree, partnership.individual1)} and ${nameOf(pedigree, partnership.individual2)}`
      : "Click a person";

  return (
    <Panel position="top-center">
      <div className="bg-white border border-gray-400 px-3 py-2 text-xs space-y-1.5 max-w-md" data-testid="picking-banner" role="status">
        <div className="font-medium">{heading}</div>
        {isParents && (
          <div className="text-gray-600">
            Picked: {picked.length === 0 ? "nobody yet" : picked.map(id => nameOf(pedigree, id)).join(" and ")}
            {picked.length === 1 && ". One more, or apply with a placeholder partner."}
          </div>
        )}
        <div className="relative">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Or type a name to pick"
            aria-label="Search individuals to pick"
            className="w-full h-6 border rounded px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-black"
          />
          {matches.length > 0 && (
            <ul className="absolute left-0 right-0 top-7 bg-white border max-h-40 overflow-y-auto z-20">
              {matches.map(i => (
                <li key={i.id}>
                  <button
                    className="w-full text-left px-2 py-1 hover:bg-gray-100"
                    onClick={() => { pickIndividual(i.id); setQuery(""); }}
                  >
                    {nameOf(pedigree, i.id)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          {isParents && (
            <button
              className="px-2 py-0.5 border rounded bg-black text-white disabled:opacity-40"
              disabled={picked.length === 0}
              onClick={applyPicking}
            >
              {picked.length === 1 ? "Apply with one parent" : "Apply"}
            </button>
          )}
          <button className="px-2 py-0.5 border rounded hover:bg-gray-100" onClick={cancelPicking}>Cancel (Esc)</button>
        </div>
      </div>
    </Panel>
  );
}
