import type { HTMLAttributes, ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { worstSeverity, type Problem, type ProblemField } from "@/pedigree/validation";
import { ProblemIcon } from "@/components/ProblemsMenu";
import { ProblemFixes } from "@/components/ProblemFixes";

// The parts of the side panel's forms that every section uses.

export interface ProblemProps {
  /** The person the problems are about, and the field (`data-problem-field`, which the problems list focuses). */
  problemFor?: string;
  problemField?: ProblemField;
  problems?: Problem[];
}

/** What a form passes down so a section can mark its own fields. */
export type ProblemsOn = (field: ProblemField) => ProblemProps;

/** A dropdown in an inline `Field`: it fills the control column. */
export const SELECT = "w-full min-w-0 h-7 border rounded px-1 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-black";

/**
 * A labelled field. `inline` puts the label in a narrow column beside the
 * control, for single-line controls, so each takes one row; a long
 * label wraps. Messages and warnings go under the control.
 */
export function Field({ label, inline, children, ...problem }: { label: string; inline?: boolean; children: ReactNode } & ProblemProps) {
  if (inline) {
    return (
      <div className="flex items-start gap-2">
        <Label className="w-[4.5rem] shrink-0 min-h-7 flex items-center text-xs leading-tight text-gray-600">{label}</Label>
        <div className="flex-1 min-w-0">
          <ProblemHighlight {...problem}>{children}</ProblemHighlight>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      <ProblemHighlight {...problem}>{children}</ProblemHighlight>
    </div>
  );
}

/**
 * Editor warnings: a thin outline round the field (black for a
 * warning, red for an error, as notices are) and each message under it,
 * with its one-click fix when the rule has one. Nothing when there are none.
 */
export function ProblemHighlight({ children, problemFor, problemField, problems = [] }: { children: ReactNode } & ProblemProps) {
  const severity = worstSeverity(problems);
  return (
    <div
      data-problem-for={problemField ? problemFor : undefined}
      data-problem-field={problemField}
      data-problem-severity={severity}
      className={`space-y-1${severity ? ` rounded-sm outline outline-1 outline-offset-2 ${severity === "error" ? "outline-red-600" : "outline-gray-500"}` : ""}`}
    >
      {children}
      {problems.map(p => (
        <p key={p.id} data-problem-message={p.id} className={`flex items-start gap-1 text-[10px] ${p.severity === "error" ? "text-red-700" : "text-gray-700"}`}>
          <span className="mt-px"><ProblemIcon severity={p.severity} size={10} /></span>
          <span>
            {p.message}
            <ProblemFixes problem={p} />
          </span>
        </p>
      ))}
    </div>
  );
}

/** A checkbox with its text after it. `className` is the row's, for the few rows laid out differently. */
export function CheckboxRow({ label, checked, onChange, name, ariaLabel, title, disabled, className = "flex items-center gap-2 cursor-pointer" }: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  name?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={className} title={title}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={e => onChange(e.target.checked)}
        className="accent-black"
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * A dropdown of one field's options, with a first option (`none`) that
 * clears the field: the empty choice is handed back as undefined.
 */
export function OptionSelect<T extends string>({ value, onChange, label, options, none = "None", name, disabled, title, className = SELECT }: {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  /** The aria-label. */
  label: string;
  options: readonly { value: T; label: string; disabled?: boolean; title?: string }[];
  none?: string;
  name?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <select
      name={name}
      value={value ?? ""}
      aria-label={label}
      disabled={disabled}
      title={title}
      onChange={e => onChange((e.target.value || undefined) as T | undefined)}
      className={className}
    >
      <option value="">{none}</option>
      {options.map(o => (
        <option key={o.value} value={o.value} disabled={o.disabled} title={o.title}>{o.label}</option>
      ))}
    </select>
  );
}

/** The small grey note under a control. */
export function Hint({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-[10px] text-gray-500${className ? ` ${className}` : ""}`} {...rest} />;
}
