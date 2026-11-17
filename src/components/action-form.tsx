"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/server/actions/result";

/** A form posting to a server action, showing the action's refusal message under it. */
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
    <form action={formAction} className={className} aria-busy={pending}>
      {children}
      {result?.error && (
        <div className="note bad" role="alert">
          {result.error}
        </div>
      )}
    </form>
  );
}
