import { kinshipCoefficients } from "@pedigree-editor/layout-engine";
import type { KinshipCoefficients, Pedigree } from "@pedigree-editor/layout-engine";
import { wholePedigree } from "./collapse";
import { couplesOf, partnerIn } from "./graph";

/**
 * Relatedness shown in the edit panel: how to write a coefficient, the
 * degree of relationship it corresponds to, and what there is to say about
 * one person. Framework-free; the numbers come from the layout engine's
 * `kinshipCoefficients`.
 */

const cache = new WeakMap<Pedigree, KinshipCoefficients>();
const xCache = new WeakMap<Pedigree, KinshipCoefficients>();

/**
 * The pedigree's kinship coefficients, computed once per pedigree object.
 * Every edit makes a new object (immer), so a cached matrix is never stale,
 * and the canvas, legend and edit panel share one computation per edit.
 */
export function kinshipOf(pedigree: Pedigree): KinshipCoefficients {
  let coefficients = cache.get(pedigree);
  if (!coefficients) { coefficients = kinshipCoefficients(pedigree); cache.set(pedigree, coefficients); }
  return coefficients;
}

/** The X-linked coefficients, cached like `kinshipOf`. */
export function kinshipXOf(pedigree: Pedigree): KinshipCoefficients {
  let coefficients = xCache.get(pedigree);
  if (!coefficients) { coefficients = kinshipCoefficients(pedigree, { chromosome: "X" }); xCache.set(pedigree, coefficients); }
  return coefficients;
}

/** Below this a float difference is rounding, not a different coefficient. */
const EPS = 1e-9;

/** Largest denominator still written as a fraction; beyond it only the decimal is readable. */
const MAX_DENOMINATOR = 256;

/**
 * A kinship or inbreeding coefficient as text. Coefficients are sums of
 * powers of 1/2, so simple ones are exact fractions: "1/16 (0.0625)". One
 * that needs a denominator over 256 is given as a decimal alone.
 */
export function formatCoefficient(x: number): string {
  if (!(x > EPS)) return "0";
  const decimal = String(Number(x.toPrecision(4)));
  const fraction = asFraction(x, MAX_DENOMINATOR);
  return fraction ? (fraction.includes("/") ? `${fraction} (${decimal})` : fraction) : decimal;
}

/**
 * A coefficient short enough to draw on the figure: a fraction up to
 * /64 ("3/8"), else two significant figures ("0.30"), which is as much as a
 * reader of a chart needs. The panels give it in full.
 */
export function briefCoefficient(x: number): string {
  if (!(x > EPS)) return "0";
  return asFraction(x, 64) ?? x.toPrecision(2);
}

/** True when the pedigree draws its coefficients ("Show kinship and inbreeding coefficients" in Settings). */
export function showsCoefficients(pedigree: Pedigree): boolean {
  return pedigree.canvasSettings?.showCoefficients === true;
}

/**
 * "F = 1/16", the line under the symbol of someone whose parents are
 * related, or undefined when the pedigree does not draw coefficients or the
 * person is not inbred. `pedigree` may be the drawn one: the number is that
 * of the whole pedigree, which a view filter does not change.
 */
export function inbreedingLabel(pedigree: Pedigree, individualId: string): string | undefined {
  if (!showsCoefficients(pedigree)) return undefined;
  const f = kinshipOf(wholePedigree(pedigree)).inbreeding(individualId);
  return f > EPS ? `F = ${briefCoefficient(f)}` : undefined;
}

/** "φ = 1/16" for a couple who are related, as `inbreedingLabel`. Their children's F is the same number. */
export function kinshipLabel(pedigree: Pedigree, id1: string, id2: string): string | undefined {
  if (!showsCoefficients(pedigree)) return undefined;
  const k = kinshipOf(wholePedigree(pedigree)).kinship(id1, id2);
  return k > EPS ? `φ = ${briefCoefficient(k)}` : undefined;
}

/** "3/8" (or "1"), when `x` is a whole number of 1/2^k for a denominator up to `maxDen`. */
function asFraction(x: number, maxDen: number): string | null {
  for (let den = 1; den <= maxDen; den *= 2) {
    const num = x * den;
    if (Math.abs(num - Math.round(num)) < EPS) return den === 1 ? String(Math.round(num)) : `${Math.round(num)}/${den}`;
  }
  return null;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/**
 * The degree of relationship a kinship coefficient corresponds to: 1/4 is
 * first degree (parent and child, full siblings), 1/8 second, 1/16 third
 * (first cousins), halving each time. "Equivalent to" because a compound
 * relationship can land on the same number, as double first cousins do on
 * 1/8. A coefficient between two degrees says so. Null when unrelated.
 */
export function degreeOfRelationship(kinship: number): string | null {
  if (!(kinship > EPS)) return null;
  const degree = -Math.log2(kinship) - 1;
  if (degree < EPS) return "genetically identical";
  const nearest = Math.round(degree);
  if (Math.abs(degree - nearest) < 1e-6) return `equivalent to ${ordinal(nearest)}-degree relatives`;
  const lower = Math.floor(degree);
  if (lower === 0) return "closer than 1st-degree relatives";
  return `between ${ordinal(lower)}- and ${ordinal(lower + 1)}-degree relatives`;
}

export interface CoupleRelatedness {
  partnershipId: string;
  partnerId: string;
  /** Kinship of the two partners, which is the inbreeding coefficient of their children. */
  kinship: number;
  /** X-linked kinship of the partners: their daughters' X-linked F. NaN when it depends on an unknown sex. */
  kinshipX: number;
}

export interface IndividualRelatedness {
  /** Inbreeding coefficient F of the individual. */
  inbreeding: number;
  /** X-linked F. NaN for a male, who has one X, and for unknown sex. */
  inbreedingX: number;
  /** One entry per partnership of the individual, in pedigree order. */
  couples: CoupleRelatedness[];
}

/** What the edit panel says about one person. */
export function relatednessOf(
  pedigree: Pedigree,
  individualId: string,
  coefficients: KinshipCoefficients = kinshipOf(pedigree),
  xCoefficients: KinshipCoefficients = kinshipXOf(pedigree),
): IndividualRelatedness {
  return {
    inbreeding: coefficients.inbreeding(individualId),
    inbreedingX: xCoefficients.inbreeding(individualId),
    couples: couplesOf(pedigree, individualId, { donorPairs: true })
      .map(p => {
        const partnerId = partnerIn(p, individualId);
        return {
          partnershipId: p.id,
          partnerId,
          kinship: coefficients.kinship(individualId, partnerId),
          kinshipX: xCoefficients.kinship(individualId, partnerId),
        };
      }),
  };
}
