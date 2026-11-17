"use client";

/** Sökningen's sortering: choosing an option submits its GET form; the form's button covers no JavaScript. */
export function SortSelect({
  defaultValue,
  options,
}: {
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select name="sortering" defaultValue={defaultValue} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
