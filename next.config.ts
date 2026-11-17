import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module and must not be bundled.
  serverExternalPackages: ["better-sqlite3"],
  // `next dev` would otherwise write an AGENTS.md; CLAUDE.md points agents at the bundled docs instead.
  agentRules: false,
};

export default nextConfig;
