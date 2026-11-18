import { normalizeMobileNumber } from "@/domain/auth";

/** The `mobil` query parameter as a normalized mobilnummer, or undefined when it is not one. */
export function mobileParam(value: string | undefined): string | undefined {
  try {
    return normalizeMobileNumber(value ?? "");
  } catch {
    return undefined;
  }
}
