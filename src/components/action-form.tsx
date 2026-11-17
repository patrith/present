"use client";

import { createContext, startTransition, useActionState, useContext } from "react";
import { SimBox } from "@/components/ui";
import type { ActionResult } from "@/server/actions/result";

const ResultContext = createContext<ActionResult>(undefined);

/**
 * A form posting to a server action. A refusal that names a field shows at that field's
 * FieldError; any other refusal shows under the form.
 * With JavaScript it submits through onSubmit, so a refusal keeps what the user typed
 * (a form `action` alone resets the fields); without JavaScript the `action` still posts.
 */
export function ActionForm({
  action,
  children,
  className = "stack",
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
}) {
  const [result, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className={className}
      aria-busy={pending}
    >
      <ResultContext.Provider value={result}>{children}</ResultContext.Provider>
      {result?.error && !result.field && (
        <Refusal result={result}>
          <div className="note bad" role="alert">
            {result.error}
          </div>
        </Refusal>
      )}
    </form>
  );
}

/** The enclosing ActionForm's refusal for the field `name`, shown where the field is. */
export function FieldError({ name }: { name: string }) {
  const result = useContext(ResultContext);
  if (!result?.error || result.field !== name) return null;
  return (
    <Refusal result={result}>
      <div className="note bad" role="alert" data-field={name}>
        {result.error}
      </div>
    </Refusal>
  );
}

/** A refusal from a simulated step sits inside that step's labelled element (FR10). */
function Refusal({ result, children }: { result: NonNullable<ActionResult>; children: React.ReactNode }) {
  return result.simulated ? <SimBox label={result.simulated}>{children}</SimBox> : children;
}
