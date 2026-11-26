import { usePedigreeFields } from "../store/usePedigreeStore";
import { layoutUShape } from "../io/svg/uShapeExporter";
import { drawnPedigree } from "../pedigree/collapse";
import { U_SHAPE_UNAVAILABLE } from "../pedigree/uShapeView";

/**
 * The U-shape view's switch (#220), for the toolbar button and, on a phone,
 * the Filter menu. With nobody to descend from it says why in a notice
 * instead of opening on an empty page; the check is a layout, so it runs on
 * the click, not on every edit.
 */
export function useUShapeToggle(): { on: boolean; toggle: () => void } {
  const { pedigree, uShapeView, setUShapeView, setNotice } = usePedigreeFields("pedigree", "uShapeView", "setUShapeView", "setNotice");
  const toggle = () => {
    if (uShapeView) { setUShapeView(false); return; }
    const layout = layoutUShape(drawnPedigree(pedigree));
    if (!layout || layout.maxDepth === 0) { setNotice({ kind: "info", text: U_SHAPE_UNAVAILABLE }); return; }
    setUShapeView(true);
  };
  return { on: uShapeView, toggle };
}
