"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";
import type { DemoPanelData } from "@/domain/demo-clock";
import { advanceDemoClockAction } from "@/server/actions/demo";
import type { ActionResult } from "@/server/actions/result";

/**
 * The demo panel (FR10), on every page in demoläge: the simulated time marked "Simulerad tid",
 * forward-only steps, and the configured reservation and reklamationsperiod. After a move the
 * page re-renders, so the statuses the time rules changed show at once.
 */
export function DemoPanel({ panel }: { panel: DemoPanelData }) {
  const router = useRouter();
  const [result, move, pending] = useActionState(async (prev: ActionResult, data: FormData) => {
    const moved = await advanceDemoClockAction(prev, data);
    // Next.js may serve cached router state after a server action: fetch the page afresh.
    router.refresh();
    return moved;
  }, undefined);
  return (
    <aside className="simbox demo-panel" aria-label="Demopanel" data-testid="demo-panel">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="lbl">Simulerad tid</span>
        <b data-testid="simulated-time">{panel.simulatedTime}</b>
      </div>
      <div className="row">
        {panel.steps.map((s) => (
          <button
            key={s.id}
            type="button"
            className="btn secondary small"
            disabled={pending}
            onClick={() => {
              const data = new FormData();
              data.set("step", s.id);
              startTransition(() => move(data));
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="s">{panel.configLine}</div>
      {result?.error && (
        <div className="note bad" role="alert">
          {result.error}
        </div>
      )}
    </aside>
  );
}
