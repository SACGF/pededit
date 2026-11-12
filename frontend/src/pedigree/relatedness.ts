import { kinshipCoefficients } from "@pedigree-editor/layout-engine";
import type { KinshipCoefficients, Pedigree } from "@pedigree-editor/layout-engine";

/**
 * Relatedness shown in the edit panel (#32): how to write a coefficient, the
 * degree of relationship it corresponds to, and what there is to say about
 * one person. Framework-free; the numbers come from the layout engine's
 * `kinshipCoefficients`.
 */

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
  for (let den = 1; den <= MAX_DENOMINATOR; den *= 2) {
    const num = x * den;
    if (Math.abs(num - Math.round(num)) < EPS) {
      return den === 1 ? String(Math.round(num)) : `${Math.round(num)}/${den} (${decimal})`;
    }
  }
  return decimal;
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
}

export interface IndividualRelatedness {
  /** Inbreeding coefficient F of the individual. */
  inbreeding: number;
  /** One entry per partnership of the individual, in pedigree order. */
  couples: CoupleRelatedness[];
}

/** What the edit panel says about one person. Pass `coefficients` to reuse a computed matrix. */
export function relatednessOf(
  pedigree: Pedigree,
  individualId: string,
  coefficients: KinshipCoefficients = kinshipCoefficients(pedigree),
): IndividualRelatedness {
  return {
    inbreeding: coefficients.inbreeding(individualId),
    couples: pedigree.partnerships
      .filter(p => p.individual1 === individualId || p.individual2 === individualId)
      .map(p => {
        const partnerId = p.individual1 === individualId ? p.individual2 : p.individual1;
        return { partnershipId: p.id, partnerId, kinship: coefficients.kinship(individualId, partnerId) };
      }),
  };
}
