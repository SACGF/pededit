import type { Pedigree } from "@pedigree-editor/layout-engine";
import { JSON_FORMAT, JSON_VERSION, type PedigreeJsonEnvelope } from "./types.js";

export interface JsonExportOptions {
  title?: string;
  /** Override the export timestamp (for deterministic tests). */
  exportedAt?: string;
}

/** Build the envelope object without serialising it. */
export function buildJsonEnvelope(pedigree: Pedigree, options: JsonExportOptions = {}): PedigreeJsonEnvelope {
  return {
    format: JSON_FORMAT,
    version: JSON_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    title: options.title ?? "pedigree",
    pedigree,
  };
}

/**
 * Serialise a pedigree to a pretty-printed JSON document.
 * Lossless: every field of the Pedigree data model is written as-is,
 * including fields this version of the exporter does not know about.
 */
export function exportJson(pedigree: Pedigree, options: JsonExportOptions = {}): string {
  return JSON.stringify(buildJsonEnvelope(pedigree, options), null, 2) + "\n";
}
