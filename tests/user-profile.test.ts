import { describe, expect, it } from "vitest";

import {
  KTP_CONTENT_TYPES,
  isValidPhone,
  isValidProfileAddress,
  isValidProfileName,
  normalizePhone,
} from "../shared/user-profile";

describe("user profile validation", () => {
  it("normalizes and validates Indonesian phone values", () => {
    expect(normalizePhone("08 1234-5678")).toBe("0812345678");
    expect(isValidPhone("08 1234-5678")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
  });

  it("requires a useful profile name and complete address", () => {
    expect(isValidProfileName("Bu")).toBe(true);
    expect(isValidProfileName("A")).toBe(false);
    expect(isValidProfileAddress("Jl. Merdeka No. 1, Jakarta")).toBe(true);
    expect(isValidProfileAddress("Jakarta")).toBe(false);
  });

  it("allows only supported KTP image content types", () => {
    expect(KTP_CONTENT_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});
