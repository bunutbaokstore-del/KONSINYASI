import { describe, expect, it } from "vitest";

import { getPeriodStorageKey } from "../lib/mitra-budget-period";

describe("Mitra production budgets", () => {
  it("builds the frontend `${productId}:${period}` lookup key used by dashboard and production screen", () => {
    expect(getPeriodStorageKey("product-1", "Bulan")).toBe("product-1:Bulan");
    expect(getPeriodStorageKey("product-1", "Hari")).toBe("product-1:Hari");
    expect(getPeriodStorageKey("product-2", "Minggu")).toBe("product-2:Minggu");
  });
});