import { it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { makeSyntheticFamily } from "../fixtures/syntheticFamily";
import { exportSvg } from "../io/svg/svgExporter";
import { layoutToFlow } from "../pedigree/layoutToFlow";
import { exportSvgReact } from "./reactExport";
it("escaping", () => {
  const name = `A <b> & "q" 'x' > é`;
  console.log(renderToStaticMarkup(<text data-x={name}><title>{name}</title>{name}</text>));
});
it("speed", () => {
  for (const generations of [6, 7, 8]) {
    const p = makeSyntheticFamily({ seed: 3, generations, minChildren: 2, maxChildren: 4, partnerRate: 0.7 });
    const t = (fn: () => unknown) => { const t0 = performance.now(); fn(); return Math.round(performance.now() - t0); };
    exportSvg(p);
    console.log(JSON.stringify({ people: p.individuals.length, layoutToFlowMs: t(() => layoutToFlow(p)), stringExportMs: t(() => exportSvg(p)), reactExportMs: t(() => exportSvgReact(p)) }));
  }
}, 600000);
