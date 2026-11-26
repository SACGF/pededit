/**
 * The SVG snapshots are compared in a canonical form, so a change that draws
 * the same pixels leaves them alone: attributes sorted by name, empty `<g>`
 * elements dropped, every element on a line of its own and indented by depth.
 * Text is kept as written: inside `<text>`, `<tspan>` and `<title>` the
 * whitespace is part of what is drawn, so those elements stay on one line.
 *
 * It reads the exporter's own markup: double-quoted attributes, no comments,
 * CDATA or processing instructions (it throws on anything else).
 */

interface El { name: string; attrs: [string, string][]; children: Node[] }
type Node = El | string;

const INLINE = new Set(["text", "tspan", "title"]);
const TOKEN = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;

function parse(svg: string): El {
  const root: El = { name: "", attrs: [], children: [] };
  const stack: El[] = [root];
  let end = 0;
  for (const m of svg.matchAll(TOKEN)) {
    if (m.index !== end) throw new Error(`canonicalSvg: cannot read "${svg.slice(end, end + 40)}"`);
    end = m.index + m[0].length;
    const [, closing, name, attrText, selfClosing, text] = m;
    const top = stack[stack.length - 1]!;
    if (text !== undefined) { top.children.push(text); continue; }
    if (closing) {
      if (top.name !== name) throw new Error(`canonicalSvg: </${name}> closes <${top.name}>`);
      stack.pop();
      continue;
    }
    const attrs = [...attrText!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(a => [a[1]!, a[2]!] as [string, string]);
    const el: El = { name: name!, attrs: attrs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)), children: [] };
    top.children.push(el);
    if (!selfClosing) stack.push(el);
  }
  if (end !== svg.length || stack.length !== 1) throw new Error("canonicalSvg: unbalanced markup");
  return root;
}

/** Drops whitespace between elements and empty groups, recursively. */
function prune(el: El): void {
  if (INLINE.has(el.name)) return;
  el.children = el.children.filter(c => {
    if (typeof c === "string") return c.trim() !== "";
    prune(c);
    return !(c.name === "g" && c.children.length === 0);
  });
}

const open = (el: El) => `<${el.name}${el.attrs.map(([k, v]) => ` ${k}="${v}"`).join("")}`;

function inline(node: Node): string {
  if (typeof node === "string") return node;
  return node.children.length ? `${open(node)}>${node.children.map(inline).join("")}</${node.name}>` : `${open(node)}/>`;
}

function lines(el: El, depth: number, out: string[]): void {
  const pad = "  ".repeat(depth);
  if (INLINE.has(el.name) || el.children.some(c => typeof c === "string")) { out.push(pad + inline(el)); return; }
  if (!el.children.length) { out.push(`${pad}${open(el)}/>`); return; }
  out.push(`${pad}${open(el)}>`);
  for (const c of el.children) lines(c as El, depth + 1, out);
  out.push(`${pad}</${el.name}>`);
}

export function canonicalSvg(svg: string): string {
  const root = parse(svg);
  prune(root);
  const out: string[] = [];
  for (const c of root.children) lines(c as El, 0, out);
  return out.join("\n") + "\n";
}
