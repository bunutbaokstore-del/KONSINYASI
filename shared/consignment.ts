export const STOCK_STATUSES = ["aman", "menipis", "habis"] as const;

export type StockStatus = (typeof STOCK_STATUSES)[number];

export type ConsignmentItem = {
  id: string;
  mitraUserId?: string;
  name: string;
  sku: string | null;
  unit: string;
  stockQuantity: number;
  minimumStock: number;
  status: StockStatus;
  updatedAt: string;
};

export type StockSummary = {
  itemCount: number;
  totalUnits: number;
  safeCount: number;
  lowCount: number;
  outOfStockCount: number;
};

export function getStockStatus(stockQuantity: number, minimumStock: number): StockStatus {
  if (stockQuantity <= 0) return "habis";
  if (stockQuantity <= minimumStock) return "menipis";
  return "aman";
}

export function summarizeStock(items: ConsignmentItem[]): StockSummary {
  return items.reduce<StockSummary>(
    (summary, item) => {
      summary.itemCount += 1;
      summary.totalUnits += item.stockQuantity;
      if (item.status === "aman") summary.safeCount += 1;
      if (item.status === "menipis") summary.lowCount += 1;
      if (item.status === "habis") summary.outOfStockCount += 1;
      return summary;
    },
    { itemCount: 0, totalUnits: 0, safeCount: 0, lowCount: 0, outOfStockCount: 0 },
  );
}
