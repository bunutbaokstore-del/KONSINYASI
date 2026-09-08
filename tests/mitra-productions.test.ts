import { describe, expect, it } from "vitest";

type ProductionStatus = "Direncanakan" | "Selesai";
type BudgetPeriod = "Hari" | "Minggu" | "Bulan";

type MitraProduction = {
  id: string;
  productId: string;
  productionDate: string;
  budgetPeriod: BudgetPeriod;
  targetQuantity: number;
  actualQuantity: number | null;
  damagedQuantity: number | null;
  yieldPercentage: number | null;
  notes: string;
  resultNotes: string;
  status: ProductionStatus;
  createdAt: string;
};

type ProductionDto = {
  id: string;
  productId: string;
  productionDate: string;
  budgetPeriod: BudgetPeriod;
  targetQuantity: number;
  actualQuantity: number | null;
  damagedQuantity: number;
  yieldPercentage: number | null;
  notes: string;
  resultNotes: string;
  status: string;
  createdAt: string;
};

function toMitraProduction(dto: ProductionDto): MitraProduction {
  return {
    id: dto.id,
    productId: dto.productId,
    productionDate: dto.productionDate,
    budgetPeriod: dto.budgetPeriod,
    targetQuantity: dto.targetQuantity,
    actualQuantity: dto.actualQuantity,
    damagedQuantity: dto.status === "planned" ? null : dto.damagedQuantity,
    yieldPercentage: dto.yieldPercentage,
    notes: dto.notes,
    resultNotes: dto.resultNotes,
    status: dto.status === "completed" ? "Selesai" : "Direncanakan",
    createdAt: dto.createdAt,
  };
}

const PLANNED_EVENT_ID = "b3f0d5c1-8a42-4c9e-9d2f-5e7a8b1c3d42";
const PRODUCT_ARABIKA_ID = "6f0c8f9e-9f3b-4c21-b8a5-32d9e1c54a08";

function makeDto(overrides: Partial<ProductionDto> = {}): ProductionDto {
  return {
    id: PLANNED_EVENT_ID,
    productId: PRODUCT_ARABIKA_ID,
    productionDate: "2026-09-01",
    budgetPeriod: "Bulan",
    targetQuantity: 100,
    actualQuantity: null,
    damagedQuantity: 0,
    yieldPercentage: null,
    notes: "",
    resultNotes: "",
    status: "planned",
    createdAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("Mitra production source", () => {
  it("maps a planned productionEvents.list DTO into MitraProduction", () => {
    const dto: ProductionDto = {
      id: PLANNED_EVENT_ID,
      productId: PRODUCT_ARABIKA_ID,
      productionDate: "2026-09-01",
      budgetPeriod: "Bulan",
      targetQuantity: 100,
      actualQuantity: null,
      damagedQuantity: 0,
      yieldPercentage: null,
      notes: "Produksi batch awal bulan",
      resultNotes: "",
      status: "planned",
      createdAt: "2026-09-01T08:00:00.000Z",
    };

    const production = toMitraProduction(dto);

    expect(production).toEqual({
      id: PLANNED_EVENT_ID,
      productId: PRODUCT_ARABIKA_ID,
      productionDate: "2026-09-01",
      budgetPeriod: "Bulan",
      targetQuantity: 100,
      actualQuantity: null,
      damagedQuantity: null,
      yieldPercentage: null,
      notes: "Produksi batch awal bulan",
      resultNotes: "",
      status: "Direncanakan",
      createdAt: "2026-09-01T08:00:00.000Z",
    });
  });

  it("maps a completed productionEvents.list DTO into MitraProduction with result fields", () => {
    const completedDto: ProductionDto = {
      id: "e92aa601-62c1-4b45-9c20-4f3b9a1c7e55",
      productId: "c4f88b79-1bed-4cd3-a33a-4b9c0f6a2dd1",
      productionDate: "2026-09-02",
      budgetPeriod: "Hari",
      targetQuantity: 50,
      actualQuantity: 47,
      damagedQuantity: 3,
      yieldPercentage: 94,
      notes: "",
      resultNotes: "Tiga unit rusak saat pengemasan",
      status: "completed",
      createdAt: "2026-09-02T10:15:00.000Z",
    };

    const production = toMitraProduction(completedDto);

    expect(production).toEqual({
      id: "e92aa601-62c1-4b45-9c20-4f3b9a1c7e55",
      productId: "c4f88b79-1bed-4cd3-a33a-4b9c0f6a2dd1",
      productionDate: "2026-09-02",
      budgetPeriod: "Hari",
      targetQuantity: 50,
      actualQuantity: 47,
      damagedQuantity: 3,
      yieldPercentage: 94,
      notes: "",
      resultNotes: "Tiga unit rusak saat pengemasan",
      status: "Selesai",
      createdAt: "2026-09-02T10:15:00.000Z",
    });
  });

  it("maps planned status to Direncanakan", () => {
    expect(toMitraProduction(makeDto({ status: "planned" })).status).toBe("Direncanakan");
  });

  it("maps completed status to Selesai", () => {
    const production = toMitraProduction(makeDto({ status: "completed", actualQuantity: 42, damagedQuantity: 2, yieldPercentage: 84, resultNotes: "Berhasil" }));
    expect(production.status).toBe("Selesai");
  });

  it("coerces planned damagedQuantity (DB default 0) to null and keeps completed value", () => {
    const planned = toMitraProduction(makeDto({ status: "planned", damagedQuantity: 0 }));
    expect(planned.damagedQuantity).toBe(null);

    const completed = toMitraProduction(makeDto({ status: "completed", actualQuantity: 47, damagedQuantity: 3, yieldPercentage: 94, resultNotes: "ok" }));
    expect(completed.damagedQuantity).toBe(3);
  });

  it("preserves nullable actualQuantity, yieldPercentage, and resultNotes", () => {
    const planned = toMitraProduction(makeDto({ actualQuantity: null, yieldPercentage: null, resultNotes: "" }));
    expect(planned.actualQuantity).toBe(null);
    expect(planned.yieldPercentage).toBe(null);
    expect(planned.resultNotes).toBe("");

    const completed = toMitraProduction(makeDto({ status: "completed", actualQuantity: 47, yieldPercentage: 94, resultNotes: "Empat rusak" }));
    expect(completed.actualQuantity).toBe(47);
    expect(completed.yieldPercentage).toBe(94);
    expect(completed.resultNotes).toBe("Empat rusak");
  });

  it("preserves real UUID ids instead of demo ids", () => {
    const productId = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
    const production = toMitraProduction(makeDto({ productId }));

    expect(production.id).toBe(PLANNED_EVENT_ID);
    expect(production.productId).toBe(productId);
    expect(production.productId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("preserves budgetPeriod across Hari, Minggu, and Bulan", () => {
    expect(toMitraProduction(makeDto({ budgetPeriod: "Hari" })).budgetPeriod).toBe("Hari");
    expect(toMitraProduction(makeDto({ budgetPeriod: "Minggu" })).budgetPeriod).toBe("Minggu");
    expect(toMitraProduction(makeDto({ budgetPeriod: "Bulan" })).budgetPeriod).toBe("Bulan");
  });

  it("preserves createdAt exactly", () => {
    const createdAt = "2026-09-05T14:30:00.000Z";
    expect(toMitraProduction(makeDto({ createdAt })).createdAt).toBe(createdAt);
  });

  it("does not leak completedAt, distributorId, or mitraUserId into the view model", () => {
    const serverDto = {
      ...makeDto({ status: "completed", actualQuantity: 47, damagedQuantity: 3, yieldPercentage: 94, resultNotes: "ok" }),
      completedAt: "2026-09-02T08:30:00.000Z",
      distributorId: "b7e1a2c3-4d5e-4f6a-8b7c-9d0e1f2a3b4c",
      mitraUserId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    } as ProductionDto;

    const production = toMitraProduction(serverDto);

    expect(production).not.toHaveProperty("completedAt");
    expect(production).not.toHaveProperty("distributorId");
    expect(production).not.toHaveProperty("mitraUserId");
  });
});