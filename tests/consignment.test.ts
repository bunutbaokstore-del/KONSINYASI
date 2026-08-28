import { describe, expect, it } from "vitest";

import { getStockStatus, summarizeStock, type ConsignmentItem } from "../shared/consignment";

describe("consignment stock rules", () => {
  it("classifies empty stock as habis before checking the minimum", () => {
    expect(getStockStatus(0, 0)).toBe("habis");
    expect(getStockStatus(0, 5)).toBe("habis");
  });

  it("classifies stock at or below the minimum as menipis", () => {
    expect(getStockStatus(3, 3)).toBe("menipis");
    expect(getStockStatus(2, 5)).toBe("menipis");
  });

  it("classifies stock above the minimum as aman", () => {
    expect(getStockStatus(6, 5)).toBe("aman");
  });

  it("summarizes item count, units, and status counts", () => {
    const items: ConsignmentItem[] = [
      { id: "1", name: "Kopi", sku: null, unit: "pcs", stockQuantity: 10, minimumStock: 3, status: "aman", updatedAt: "2026-08-28T00:00:00.000Z" },
      { id: "2", name: "Teh", sku: "TEH-01", unit: "box", stockQuantity: 2, minimumStock: 4, status: "menipis", updatedAt: "2026-08-28T00:00:00.000Z" },
      { id: "3", name: "Gula", sku: null, unit: "kg", stockQuantity: 0, minimumStock: 2, status: "habis", updatedAt: "2026-08-28T00:00:00.000Z" },
    ];

    expect(summarizeStock(items)).toEqual({
      itemCount: 3,
      totalUnits: 12,
      safeCount: 1,
      lowCount: 1,
      outOfStockCount: 1,
    });
  });
});
