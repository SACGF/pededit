/**
 * Geometry for reading an exported SVG back: transform matrices, the
 * attributes of a tag, and the polylines of the paths, circles and arcs the
 * exporters write. Shared by the U-shape lint and the key's placement
 * (`keyPlacement.ts`).
 */

export type M = [number, number, number, number, number, number]; // a b c d e f
export type P = [number, number];
export const IDENTITY: M = [1, 0, 0, 1, 0, 0];

export const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const apply = (m: M, [x, y]: P): P => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const invert = (m: M): M => {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
};

export function parseTransform(t: string | undefined): M {
  let m = IDENTITY;
  if (!t) return m;
  for (const [, op, args] of t.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
    const v = args!.trim().split(/[\s,]+/).map(Number);
    if (op === "translate") m = mul(m, [1, 0, 0, 1, v[0]!, v[1] ?? 0]);
    else if (op === "scale") m = mul(m, [v[0]!, 0, 0, v[1] ?? v[0]!, 0, 0]);
    else {
      const a = (v[0]! * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      const rot: M = [cos, sin, -sin, cos, 0, 0];
      if (v.length >= 3) m = mul(mul(mul(m, [1, 0, 0, 1, v[1]!, v[2]!]), rot), [1, 0, 0, 1, -v[1]!, -v[2]!]);
      else m = mul(m, rot);
    }
  }
  return m;
}

export const attrsOf = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k!, v!]));
export const num = (a: Record<string, string>, k: string) => Number(a[k] ?? 0);

/** Points along an SVG arc (rx = ry, no x-rotation) from p0 to p1. */
function arcPoints(p0: P, r: number, large: boolean, sweep: boolean, p1: P): P[] {
  const [x1, y1] = p0, [x2, y2] = p1;
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const d2 = dx * dx + dy * dy;
  const rr = Math.max(r, Math.sqrt(d2));
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rr * rr - d2) / d2));
  const cx = k * dy + (x1 + x2) / 2, cy = -k * dx + (y1 + y2) / 2;
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  let da = Math.atan2(y2 - cy, x2 - cx) - a1;
  if (sweep && da < 0) da += 2 * Math.PI;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  const steps = Math.max(2, Math.ceil((Math.abs(da) * rr) / 4));
  return Array.from({ length: steps + 1 }, (_, i) => [cx + rr * Math.cos(a1 + (da * i) / steps), cy + rr * Math.sin(a1 + (da * i) / steps)] as P);
}

/** Polylines of a path's d (absolute M, L, Q, A, Z only, as the exporters write). */
export function pathPolylines(d: string): P[][] {
  const out: P[][] = [];
  const tokens = d.match(/[MLQAZ]|-?[\d.]+(?:e-?\d+)?/gi) ?? [];
  let i = 0, cur: P = [0, 0], start: P = [0, 0], line: P[] = [];
  const n = () => Number(tokens[i++]);
  let cmd = "";
  while (i < tokens.length) {
    if (/[MLQAZ]/i.test(tokens[i]!)) cmd = tokens[i++]!.toUpperCase();
    if (cmd === "M") { if (line.length > 1) out.push(line); cur = [n(), n()]; start = cur; line = [cur]; cmd = "L"; }
    else if (cmd === "L") { cur = [n(), n()]; line.push(cur); }
    else if (cmd === "Q") {
      const c: P = [n(), n()], end: P = [n(), n()], from = cur;
      for (let k = 1; k <= 12; k++) {
        const t = k / 12, u = 1 - t;
        line.push([u * u * from[0] + 2 * u * t * c[0] + t * t * end[0], u * u * from[1] + 2 * u * t * c[1] + t * t * end[1]]);
      }
      cur = end;
    }
    else if (cmd === "A") {
      const r = n(); n(); n(); const large = n() === 1, sweep = n() === 1; const end: P = [n(), n()];
      line.push(...arcPoints(cur, r, large, sweep, end).slice(1)); cur = end;
    } else if (cmd === "Z") { line.push(start); cur = start; cmd = ""; }
    else i++;
  }
  if (line.length > 1) out.push(line);
  return out;
}

export const circlePolyline = (cx: number, cy: number, r: number): P[] =>
  Array.from({ length: 25 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 12), cy + r * Math.sin((i * Math.PI) / 12)] as P);
