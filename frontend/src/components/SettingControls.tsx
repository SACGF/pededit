import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * A setting as a checkbox with its title and a grey description under it,
 * as Settings and the Filter menu list them. `align="start"` puts the box by
 * the title's first line, for descriptions that run to several lines.
 * `name` is what the page checks select by.
 */
export function SettingToggle({ label, description, checked, onChange, name, align = "center", className, inputProps }: {
  label: ReactNode;
  description: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  name?: string;
  align?: "center" | "start";
  /** Added to the row, for spacing. */
  className?: string;
  /** Any other attributes of the checkbox, such as a data-testid. */
  inputProps?: InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}`, string>;
}) {
  return (
    <label className={`flex ${align === "start" ? "items-start" : "items-center"} gap-2 cursor-pointer${className ? ` ${className}` : ""}`}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className={align === "start" ? "mt-0.5" : undefined}
        {...inputProps}
      />
      <div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-gray-400">{description}</div>
      </div>
    </label>
  );
}

/** A setting chosen from a list: its title, the dropdown and a grey description. */
export function SettingSelect<T extends string>({ label, description, name, value, options, onChange }: {
  label: string;
  description: ReactNode;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="mt-2">
      <div className="text-sm">{label}</div>
      <select
        name={name}
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="mt-1 w-full h-7 border rounded px-2 text-sm bg-white focus:outline-hidden focus:ring-1 focus:ring-black"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <div className="text-xs text-gray-400 mt-1">{description}</div>
    </div>
  );
}
