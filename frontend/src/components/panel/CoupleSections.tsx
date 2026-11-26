import type { ChildlessStatus, Individual } from "@pedigree-editor/layout-engine";
import { usePedigreeFields } from "@/store/usePedigreeStore";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/Legend";
import { ENDED_LABEL, ENDED_TITLE } from "@/pedigree/ended";
import { personCouples } from "@/pedigree/partners";
import { CHILDLESS_OPTIONS } from "@/pedigree/childless";
import { formatCoefficient, degreeOfRelationship, relatednessOf } from "@/pedigree/relatedness";
import { referenceRelatedness } from "@/pedigree/referenceRelatedness";
import { namedCoupleRelationship } from "@/pedigree/consanguinityLabel";
import { capitalised } from "@/utils/text";
import { CheckboxRow, Field, Hint, OptionSelect } from "./fields";

// The Person tab's sections about a person's couples: Relatedness, with
// each couple's double-line checkbox, and Partners.

/** An X-linked coefficient, which is NaN when it turns on someone's unknown sex. */
function formatCoefficientX(x: number): string {
  return Number.isNaN(x) ? "unknown (a sex is not recorded)" : formatCoefficient(x);
}

/**
 * Relatedness worked out from the drawn structure: one line for how
 * the person is related to the proband and the consultand, the person's
 * inbreeding coefficient, and for each partner the couple's kinship
 * coefficient, which is what their children's inbreeding coefficient will
 * be. Each has its X-linked value beside it. The coefficients are
 * read-only.
 *
 * Each couple also has the double-line checkbox, labelled
 * "Consanguineous with" so it can be found. When the pedigree
 * shows the two are related it is ticked and fixed, since the line follows
 * the kinship. Otherwise it is the override for a couple known to be related
 * whose common ancestors are not drawn.
 */
export function RelatednessSection({ individual }: { individual: Individual }) {
  const { pedigree, setPartnershipConsanguineous } = usePedigreeFields("pedigree", "setPartnershipConsanguineous");
  const { inbreeding, inbreedingX, couples } = relatednessOf(pedigree, individual.id);
  const partners = personCouples(pedigree, individual.id);
  const references = referenceRelatedness(pedigree, individual.id);
  if (!(inbreeding > 0) && couples.length === 0 && references.length === 0) return null;

  return (
    <div className="border-t pt-3 space-y-2" data-testid="relatedness">
      <SectionHeader>Relatedness</SectionHeader>
      <div className="text-xs text-gray-600 space-y-1.5">
        {references.map(r => (
          <div key={r.referenceId} data-testid="reference-relatedness" data-role={r.role}>
            <span className="text-gray-800">{r.text}</span>
            {r.detail && <div className="text-[10px] text-gray-500">{r.detail}</div>}
          </div>
        ))}
        {inbreeding > 0 && (
          <div data-testid="inbreeding" title="The chance that this person's two copies of a gene are the same copy inherited through both parents. It equals the kinship coefficient of the parents.">
            Inbreeding coefficient (F): <span className="font-medium">{formatCoefficient(inbreeding)}</span>
            <div data-testid="inbreeding-x" title="The same for the X chromosome, which matters for X-linked recessive conditions. A male has one X, so he cannot be inbred on it.">
              X-linked F: <span className="font-medium">{individual.sex === "male" ? "not applicable (one X)" : formatCoefficientX(inbreedingX)}</span>
            </div>
            <div className="text-[10px] text-gray-500">Parents {degreeOfRelationship(inbreeding)}.</div>
          </div>
        )}
        {couples.map(c => {
          const partner = partners.find(x => x.partnershipId === c.partnershipId)?.phrase ?? "";
          const related = c.kinship > 0;
          const flagged = !!pedigree.partnerships.find(p => p.id === c.partnershipId)?.consanguineous;
          return (
            <div key={c.partnershipId} data-testid="couple-kinship">
              <CheckboxRow
                label={<>Consanguineous with {partner}</>}
                className={`flex items-center gap-2 ${related ? "" : "cursor-pointer"}`}
                title={related
                  ? "The pedigree shows they are related, so the couple line is double."
                  : "Draws the couple line double. For a couple known to be related when the pedigree does not show how."}
                checked={related || flagged}
                disabled={related}
                onChange={on => setPartnershipConsanguineous(c.partnershipId, on)}
              />
              {!related && !flagged && (
                <Hint className="pl-5">
                  Tick for a couple known to be related when the pedigree does not show how. Draws a double line.
                </Hint>
              )}
              {related && (
                <div className="pl-5" title="The kinship coefficient of a couple is the inbreeding coefficient of their children.">
                  Kinship <span className="font-medium">{formatCoefficient(c.kinship)}</span>
                  <div data-testid="couple-kinship-x" title="X-linked kinship of the couple: the X-linked inbreeding coefficient of their daughters. Sons have one X and are not inbred on it.">
                    X-linked kinship <span className="font-medium">{formatCoefficientX(c.kinshipX)}</span>
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {capitalised(degreeOfRelationship(c.kinship) ?? "")}. Their children have F = {formatCoefficient(c.kinship)}
                    {Number.isNaN(c.kinshipX) ? "." : `, their daughters X-linked F = ${formatCoefficient(c.kinshipX)}.`}
                  </div>
                </div>
              )}
              {!related && flagged && (
                <Hint className="pl-5">
                  Double line. The pedigree does not show how they are related, so there is no coefficient.
                </Hint>
              )}
              {(related || flagged) && <ConsanguinityLabelField partnershipId={c.partnershipId} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The text above a couple's double line. NSGC writes the degree of
 * relationship there when the drawing does not show it, so it matters most
 * for the manual override. When the pedigree names the relationship, a
 * button fills it in.
 */
function ConsanguinityLabelField({ partnershipId }: { partnershipId: string }) {
  const { pedigree, setPartnershipConsanguinityLabel } = usePedigreeFields("pedigree", "setPartnershipConsanguinityLabel");
  const partnership = pedigree.partnerships.find(p => p.id === partnershipId);
  if (!partnership) return null;
  const named = namedCoupleRelationship(pedigree, partnership);
  const own = partnership.consanguinityLabel ?? "";
  const auto = !own.trim() && pedigree.canvasSettings?.relationshipLabels ? named : null;
  return (
    <div className="pl-5 pt-1 space-y-1" data-testid="consanguinity-label">
      <Input
        value={own}
        aria-label="Written above the double line"
        onChange={e => setPartnershipConsanguinityLabel(partnershipId, e.target.value)}
        className="h-7 text-sm"
        placeholder={auto ?? "Above the line, e.g. third cousins"}
      />
      <Hint>
        {auto
          ? `"${auto}" is written above the line (Settings, name consanguineous relationships). Type to replace it.`
          : "Written above the double line. For when the pedigree does not show how they are related."}
      </Hint>
      {named && own.trim() !== named && !auto && (
        <button
          type="button"
          onClick={() => setPartnershipConsanguinityLabel(partnershipId, named)}
          className="text-[10px] underline text-gray-600 hover:text-black"
        >
          Write "{named}"
        </button>
      )}
    </div>
  );
}

/**
 * Partners: one block per couple this person is in, with the ended
 * mark (two short strokes across the couple line for a separation or
 * divorce) and, while the couple has no children, the childless mark.
 * A gamete donation pair is not a couple and is left out.
 */
export function PartnersForm({ individual }: { individual: Individual }) {
  const { pedigree, setPartnershipEnded, setPartnershipChildless, setPartnershipChildlessReason } = usePedigreeFields("pedigree", "setPartnershipEnded", "setPartnershipChildless", "setPartnershipChildlessReason");
  const own = personCouples(pedigree, individual.id).filter(c => !c.donorPair);
  if (own.length === 0) return null;
  return (
    <div className="border-t pt-3 space-y-2" data-testid="partners-form">
      <SectionHeader>Partners</SectionHeader>
      {own.map(c => {
        const p = pedigree.partnerships.find(q => q.id === c.partnershipId)!;
        const partner = c.phrase;
        return (
          <div key={p.id} className="space-y-1 text-xs text-gray-600" data-partner-row={p.id}>
            <div className="text-gray-800 break-words">{c.label}</div>
            <CheckboxRow
              label={ENDED_LABEL}
              ariaLabel={`${ENDED_LABEL} with ${partner}`}
              title={ENDED_TITLE}
              checked={!!p.ended}
              onChange={on => setPartnershipEnded(p.id, on)}
            />
            {c.childless && (
              <Field inline label="No children">
                <OptionSelect<ChildlessStatus>
                  label={`Childless mark with ${partner}`}
                  none="No mark"
                  value={p.childless}
                  options={CHILDLESS_OPTIONS}
                  onChange={v => setPartnershipChildless(p.id, v)}
                />
                {p.childless && (
                  <Input
                    value={p.childlessReason ?? ""}
                    aria-label="Reason shown under the mark"
                    onChange={e => setPartnershipChildlessReason(p.id, e.target.value)}
                    className="h-7 text-xs"
                    placeholder="Reason, e.g. vasectomy"
                  />
                )}
              </Field>
            )}
          </div>
        );
      })}
    </div>
  );
}
