import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowUp, ArrowDown, Trash2, Plus, BookmarkPlus } from "lucide-react";
import type { Tag, TagFill, TagStyle } from "@pedigree-editor/layout-engine";
import { TAG_FILL_OPTIONS, fillLayers, tagFillMode } from "../pedigree/tagFills";
import { usePedigreeStore } from "../store/usePedigreeStore";
import { useAppStore } from "../store/useAppStore";
import { tagPresetApi, type TagPresetPayload } from "../api/client";
import {
  TAG_PALETTE, TAG_STYLE_LABELS, sectionName,
  pedigreeTags, quadrantTags, nextTagColor, unusedTagSuggestions,
} from "../pedigree/tags";

interface TagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STYLES: TagStyle[] = ["quadrant", "dot", "text"];

// ── Colour picker ─────────────────────────────────────────────────────────────

function ColorSwatch({ color, style, fill, size = 14 }: { color: string; style: TagStyle; fill?: TagFill; size?: number }) {
  if (style === "quadrant" && fill && fill !== "solid") {
    // A whole-swatch sample of the pattern, from the same geometry as the symbols.
    const box = { x: 0, y: 0, size };
    const d = `M0 0H${size}V${size}H0Z`;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="inline-block shrink-0 border border-black/20" data-fill-swatch={fill}>
        {fillLayers(fill, color, d, box).map((l, i) => (
          <path key={i} d={l.d} fill={l.fill} stroke={l.stroke} strokeWidth={l.strokeWidth} />
        ))}
      </svg>
    );
  }
  return (
    <span
      className="inline-block shrink-0 border border-black/20"
      style={{ width: size, height: size, background: color, borderRadius: style === "dot" ? "50%" : 0 }}
    />
  );
}

function ColorPicker({ tag, onChange }: { tag: Tag; onChange: (color: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title="Colour" className="p-0.5 rounded hover:bg-gray-100">
          <ColorSwatch color={tag.color} style={tag.style} fill={tag.fill} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" side="bottom" align="start">
        <div className="grid grid-cols-5 gap-1 mb-2">
          {TAG_PALETTE.map(c => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onChange(c)}
              className={`w-5 h-5 border ${c === tag.color ? "border-black ring-1 ring-black" : "border-black/20"}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 text-[10px] text-gray-500">
          Custom
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : "#000000"}
            onChange={e => onChange(e.target.value)}
            className="w-6 h-5 p-0 border-0 bg-transparent cursor-pointer"
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function TagsDialog({ open, onOpenChange }: TagsDialogProps) {
  const { pedigree, addTag, updateTag, deleteTag, moveTag } = usePedigreeStore();
  const { isAuthenticated } = useAppStore();
  const tags = pedigreeTags(pedigree);
  const quads = quadrantTags(pedigree);

  const [presets, setPresets] = useState<TagPresetPayload[]>([]);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isAuthenticated) return;
    tagPresetApi.list()
      .then(({ data }) => { setPresets(data); setPresetsError(null); })
      .catch(() => setPresetsError("Could not load your tag library."));
  }, [open, isAuthenticated]);

  function handleAdd() {
    // Four quarters is the readable limit, so a fifth tag starts as a dot rather
    // than silently turning every quarter into a pie slice.
    const style: TagStyle = quads.length < 4 ? "quadrant" : "dot";
    addTag({ label: `Tag ${tags.length + 1}`, color: nextTagColor(tags), style });
  }

  function handleAddFromPreset(p: TagPresetPayload) {
    addTag({ label: p.label, color: p.color, style: p.style, abbrev: p.abbrev || undefined });
  }

  async function handleSaveToLibrary(tag: Tag) {
    try {
      const { data } = await tagPresetApi.create({
        label: tag.label, color: tag.color, style: tag.style, abbrev: tag.abbrev ?? "",
      });
      setPresets(prev => [...prev, data].sort((a, b) => a.label.localeCompare(b.label)));
    } catch {
      setPresetsError("Could not save to your tag library.");
    }
  }

  async function handleDeletePreset(id: string) {
    try {
      await tagPresetApi.delete(id);
      setPresets(prev => prev.filter(p => p.id !== id));
    } catch {
      setPresetsError("Could not remove the tag from your library.");
    }
  }

  const usageCount = (tagId: string) =>
    pedigree.individuals.filter(i => i.tags?.includes(tagId)).length;

  const inLibrary = (tag: Tag) =>
    presets.some(p => p.label === tag.label && p.color === tag.color && p.style === tag.style);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">Tags</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Tags mark individuals with a condition, a genotype or a sample status.
            A quadrant tag fills a quarter of the symbol; the order below sets which quarter.
            Its fill can be solid or a pattern (hatched, lines, dotted) drawn in the tag's colour.
            A quadrant is a condition (the person is affected with it) unless set to trait: a coloured
            section that says nothing about affected status, such as a cohort or a sample.
          </p>
          {tagFillMode(pedigree) === "monochrome" && (
            <p className="text-[10px] text-gray-500">
              Settings has tag fills set to black and white: every tag is drawn in black, and quadrant tags
              with a solid fill get a pattern of their own.
            </p>
          )}

          {tags.length === 0 ? (
            <p className="text-xs text-gray-400">No tags yet.</p>
          ) : (
            <div className="border divide-y">
              {tags.map((tag, i) => {
                const position = tag.style !== "quadrant" ? null : sectionName(tag, pedigree);
                return (
                  <div key={tag.id} className="flex items-center gap-1.5 px-2 py-1.5 min-w-0">
                    <ColorPicker tag={tag} onChange={color => updateTag(tag.id, { color })} />

                    <input
                      value={tag.label}
                      onChange={e => updateTag(tag.id, { label: e.target.value })}
                      placeholder="Label"
                      className="flex-1 basis-0 w-0 min-w-[6rem] h-6 px-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-black"
                    />

                    <select
                      value={tag.style}
                      onChange={e => updateTag(tag.id, { style: e.target.value as TagStyle })}
                      title={TAG_STYLE_LABELS[tag.style]}
                      className="h-6 text-xs border rounded px-1 bg-white"
                    >
                      {STYLES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>

                    {tag.style === "quadrant" && (
                      <select
                        name="tag-fill"
                        aria-label="Fill"
                        value={tag.fill ?? "solid"}
                        onChange={e => {
                          const fill = e.target.value as TagFill;
                          updateTag(tag.id, { fill: fill === "solid" ? undefined : fill });
                        }}
                        title="How the tag fills its part of the symbol, in the tag's colour"
                        className="h-6 w-28 shrink-0 text-xs border rounded px-1 bg-white"
                      >
                        {TAG_FILL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    )}

                    {tag.style === "quadrant" && (
                      <select
                        name="tag-kind"
                        aria-label="Meaning"
                        value={tag.kind ?? "condition"}
                        onChange={e => updateTag(tag.id, { kind: e.target.value === "trait" ? "trait" : undefined })}
                        title="Condition: the person is affected with it (NSGC shading). Trait: a coloured section only, not affected status (#118)."
                        className="h-6 w-24 shrink-0 text-xs border rounded px-1 bg-white"
                      >
                        <option value="condition">Condition</option>
                        <option value="trait">Trait</option>
                      </select>
                    )}

                    {tag.style === "text" && (
                      <input
                        value={tag.abbrev ?? ""}
                        onChange={e => updateTag(tag.id, { abbrev: e.target.value || undefined })}
                        placeholder="abbrev"
                        title="Short text drawn under the symbol"
                        className="w-14 shrink-0 h-6 px-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-black"
                      />
                    )}

                    <span className="w-16 shrink-0 text-[10px] text-gray-400 truncate" title={position?.title} data-tag-section={position?.name}>
                      {position?.name}
                    </span>

                    <span className="w-5 shrink-0 text-[10px] text-gray-400 text-right" title="Individuals with this tag">
                      {usageCount(tag.id)}
                    </span>

                    <IconButton title="Move up" disabled={i === 0} onClick={() => moveTag(tag.id, -1)}>
                      <ArrowUp size={12} />
                    </IconButton>
                    <IconButton title="Move down" disabled={i === tags.length - 1} onClick={() => moveTag(tag.id, 1)}>
                      <ArrowDown size={12} />
                    </IconButton>
                    {isAuthenticated && (
                      <IconButton
                        title={inLibrary(tag) ? "Already in your library" : "Save to my tag library"}
                        disabled={inLibrary(tag) || !tag.label.trim()}
                        onClick={() => handleSaveToLibrary(tag)}
                      >
                        <BookmarkPlus size={12} />
                      </IconButton>
                    )}
                    <IconButton title="Delete tag" destructive onClick={() => deleteTag(tag.id)}>
                      <Trash2 size={12} />
                    </IconButton>
                  </div>
                );
              })}
            </div>
          )}

          {quads.length > 4 && (
            <p className="text-[10px] text-gray-500">
              More than four quadrant tags: the first four keep their quarter. Anyone with a fifth or later
              quadrant tag has their quadrant tags drawn as equal slices, clockwise from the top.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleAdd}>
              <Plus size={12} /> Add tag
            </Button>
            {unusedTagSuggestions(pedigree).map(s => (
              <button
                key={s.label}
                type="button"
                title={`Add a text tag "${s.label}"`}
                onClick={() => addTag({ ...s })}
                className="h-7 px-2 text-[11px] font-mono border rounded hover:bg-gray-100"
              >
                + {s.abbrev}
              </button>
            ))}
          </div>

          {isAuthenticated && (
            <div className="border-t pt-3">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                My tag library
              </div>
              {presetsError && <p className="text-[10px] text-red-600 mb-1">{presetsError}</p>}
              {presets.length === 0 ? (
                <p className="text-[10px] text-gray-400">
                  Save a tag with the bookmark button to reuse it in other pedigrees.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {presets.map(p => (
                    <li key={p.id} className="flex items-center gap-2 text-xs">
                      <ColorSwatch color={p.color} style={p.style} size={10} />
                      <span className="flex-1 truncate">{p.label}</span>
                      <span className="text-[10px] text-gray-400">{p.style}</span>
                      <button
                        type="button"
                        onClick={() => handleAddFromPreset(p)}
                        className="text-[10px] px-1.5 py-0.5 border rounded hover:bg-gray-100"
                      >
                        Add
                      </button>
                      <IconButton title="Remove from library" destructive onClick={() => handleDeletePreset(p.id)}>
                        <Trash2 size={11} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IconButton({
  title, onClick, disabled, destructive, children,
}: { title: string; onClick: () => void; disabled?: boolean; destructive?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1 rounded transition-colors
        ${destructive ? "text-gray-400 hover:text-red-600 hover:bg-red-50" : "text-gray-500 hover:text-black hover:bg-gray-100"}
        disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  );
}
