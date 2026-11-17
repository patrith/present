"use client";

import { startTransition, useActionState } from "react";
import type { ActionResult } from "@/server/actions/result";

/**
 * A form posting to a server action, showing the action's refusal message under it.
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
      {children}
      {result?.error && (
        <div className="note bad" role="alert">
          {result.error}
        </div>
      )}
    </form>
  );
}
