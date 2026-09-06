import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "app/(tabs)/production.tsx"), "utf8");

describe("Persistent Production COMPLETE", () => {
  it("uses the existing complete mutation and persistent event ID", () => {
    expect(source).toContain("trpc.productionEvents.complete.useMutation");
    expect(source).toContain("eventId: selectedResult.id");
    expect(source).toContain("selectedResult = persistentProductions.find");
    expect(source).not.toContain("updateMitraProductionResult(");
    expect(source).not.toContain("trpc.productionEvents.complete.useMutation().mutate");
  });

  it("sends the locked result payload without client actor or product fields", () => {
    const completeCall = source.slice(source.indexOf("completeProductionMutation.mutate("), source.indexOf("completeProductionMutation.mutate(") + 300);
    expect(completeCall).toContain("eventId: selectedResult.id");
    expect(completeCall).toContain("actualQuantity: actual");
    expect(completeCall).toContain("damagedQuantity: damaged");
    expect(completeCall).toContain("yieldPercentage: percentage");
    expect(completeCall).toContain("resultNotes: resultNotes.trim()");
    expect(completeCall).not.toContain("distributorId:");
    expect(completeCall).not.toContain("mitraUserId:");
    expect(completeCall).not.toContain("productId:");
    expect(completeCall).not.toContain("consignmentItemId:");
  });

  it("preserves net result and informational fields without client stock logic", () => {
    expect(source).toContain("const percentage = selectedResult.targetQuantity > 0");
    expect(source).not.toContain("actual - damaged");
    expect(source).not.toContain("complete_mitra_production_event");
    expect(source).not.toContain("stock_movements");
    expect(source).not.toContain("mitraProductionStock");
  });

  it("invalidates persistent events and provides pending/error/success behavior", () => {
    expect(source).toContain("await utils.productionEvents.list.invalidate()");
    expect(source).toContain("isSaving={completeProductionMutation.isPending}");
    expect(source).toContain("disabled={isSaving}");
    expect(source).toContain("Menyimpan...");
    expect(source).toContain("Hasil produksi belum dapat disimpan.");
    expect(source).toContain("Hasil produksi tersimpan ke Production Event.");
  });

  it("does not add edit, delete, correction, rollback, or fallback behavior", () => {
    expect(source).not.toContain("fallback");
    expect(source).not.toContain("rollback");
    expect(source).not.toContain("partial completion");
    expect(source).not.toContain("productionCorrection");
  });
});
