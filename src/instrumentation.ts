/** Runs once per Next.js server start: starts the sweep of time rules in the Node.js runtime. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDeps } = await import("@/server/deps");
  const { startSweep } = await import("@/server/sweep");
  startSweep(getDeps);
}
