import fs from "node:fs";
import { describe, expect, it } from "vitest";

/** The rows of README's "Prioriterade felscenarier" table: number, test file and test name. */
function failureScenarioRows(readme: string) {
  const section = readme.split("## Prioriterade felscenarier")[1]?.split(/\r?\n## /)[0] ?? "";
  return section
    .split(/\r?\n/)
    .map((line) => line.match(/^\|\s*(\d+)\s*\|[^|]*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(([, n, file, test]) => ({ n: Number(n), file, test }));
}

describe("README", () => {
  it("every prioritized failure scenario maps to an existing test", () => {
    const rows = failureScenarioRows(fs.readFileSync("README.md", "utf8"));
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const { n, file, test } of rows) {
      expect(fs.existsSync(file), `scenario ${n}: ${file} exists`).toBe(true);
      const source = fs.readFileSync(file, "utf8");
      expect(source.includes(`it("${test}"`) || source.includes(`test("${test}"`), `scenario ${n}: "${test}" in ${file}`).toBe(
        true,
      );
    }
  });
});
