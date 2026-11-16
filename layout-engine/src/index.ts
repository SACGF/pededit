// The package's public API. Three groups, in the order of the README:
// layout, kinship, and the data model's types. The last group is exported
// for the PedEdit editor and may change in any release.

// ---- Layout ----
export { alignPedigree } from "./alignPedigree.js";
export type { AlignOptions } from "./alignPedigree.js";
export { alignPedigreeByFamily, splitFamilies, FAMILY_GAP, RELAXED_WIDTH_SLACK } from "./families.js";
export { buildPartnerSet, buildPartnerSetFromPedigree, isPartnerPair, resolveCouple } from "./couples.js";
export type { PartnerSet, ResolvedCouple } from "./couples.js";
export { pedigreeToGeometry } from "./pedigreeToGeometry.js";
export type { PedigreeGeometry, NodeGeometry, CoupleGeometry, SibshipGeometry, RenderingConstants } from "./pedigreeToGeometry.js";
export { buildPedigreeFromFlat } from "./utils.js";
export type { FlatPedRow } from "./utils.js";

// ---- Kinship ----
export { kinshipCoefficients } from "./kinship.js";
export type { KinshipCoefficients, KinshipOptions } from "./kinship.js";

// ---- Data model ----
export type { LayoutResult, Pedigree, Individual, Partnership, Sex, GenderIdentity, SymbolsShowMode, NotationEdition, LifeStatus, Adoption, ReproductiveRole, ChildlessStatus, Zygosity, TwinSet, SiblingOrderMode, SiblingOrderSettings, CanvasSettings, NameLabelMode, LayoutWidthMode, Tag, TagStyle, TagFill, TagKind, TagFillMode, ClinicalDetails } from "./types.js";
export type { Evaluation, EvaluationResult } from "./types.js";
export type { ViewFilters } from "./types.js";
export { isAffected, isConditionTag } from "./affected.js";

// ---- For the PedEdit editor: not a stable API ----
// Steps of the kinship2 pipeline and their 1-based working types, and the
// editor's hooks into the layout (#45, #106). Exported because the editor
// and its tests call them; they follow the editor's needs, not semver.
export { kindepth } from "./kindepth.js";
export { autohint } from "./autohint.js";
export type { AutohintOptions } from "./autohint.js";
export { buildLayoutInput } from "./utils.js";
export type { Hints, LayoutInput } from "./types.js";
export { applyPartnerSides, drawnLeftPartner } from "./partnerSides.js";
export { placementParentOf, carrierAbove } from "./assisted.js";
