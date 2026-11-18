import { describe, expect, it } from "vitest";
import { normalizeMobileNumber } from "@/domain/auth";

describe("mobilnummer", () => {
  it("normalizes swedish mobile numbers and rejects others", () => {
    for (const spelling of [
      "0701234567",
      "070-123 45 67",
      "070 123 45 67",
      "+46 70 123 45 67",
      "0046 70 123 45 67",
      "+46701234567",
    ]) {
      expect(normalizeMobileNumber(spelling), spelling).toBe("0701234567");
    }
    expect(normalizeMobileNumber("073-987 65 43")).toBe("0739876543");

    for (const refused of ["0812345678", "07012345", "abc", "", "070123456789", "+46 8 123 456 78", "46701234567"]) {
      expect(() => normalizeMobileNumber(refused), refused).toThrow(
        expect.objectContaining({ code: "invalid_phone", message: expect.stringContaining("070 123 45 67") }),
      );
    }
  });
});
