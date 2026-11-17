"use server";

import { revalidatePath } from "next/cache";
import { advanceDemoClock, demoStepMs } from "@/domain/demo-clock";
import { getDeps } from "../deps";
import { type ActionResult, refusal } from "./result";

/** The demo panel's "+1 min", "+5 min" and "+1 dag": moves the simulated klocka and applies the time rules. */
export async function advanceDemoClockAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    // An unknown step id is not a positive step: advanceDemoClock refuses it.
    await advanceDemoClock(getDeps(), demoStepMs(String(form.get("step") ?? "")) ?? 0);
  } catch (e) {
    return refusal(e);
  }
  revalidatePath("/", "layout");
  return undefined;
}
