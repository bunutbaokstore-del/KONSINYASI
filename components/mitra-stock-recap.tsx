import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import type { BudgetPeriod } from "@/lib/mitra-production-budgets";
import { useMitraProductionHpps } from "@/lib/mitra-production-hpp";
import { useMitraProductions } from "@/lib/mitra-productions";
import { useMitraProducts } from "@/lib/mitra-products";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const PERIODS: Array<BudgetPeriod | "all"> = ["all", "Hari", "Minggu", "Bulan"];

export function MitraStockRecap() {
  const colors = useColors();
  const stockQuery = trpc.mitraProductionStock.list.useQuery();
  const products = useMitraProducts();
  const productions = useMitraProductions();
  const hpps = useMitraProductionHpps();
  const [productFilter, setProductFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<BudgetPeriod | "all">("all");
  const persistentRows = (stockQuery.data ?? []).filter((row) => row.product && (productFilter === "all" || row.productId === productFilter)).map((row) => {
    const completedProductions = productions.filter((production) => production.productId === row.productId && production.status === "Selesai" && (periodFilter === "all" || production.budgetPeriod === periodFilter));
    const totalActual = completedProductions.reduce((sum, production) => sum + (production.actualQuantity ?? 0), 0);
    const hppPerUnit = hpps.get(row.productId)?.costPerUnit ?? 0;
    return {
      product: row.product!,
      totalCompleted: completedProductions.length,
      totalActual,
      stockIn: totalActual,
      stockAvailable: row.availableQuantity,
      stockValue: row.availableQuantity * hppPerUnit,
      hppPerUnit,
    };
  });
  const totalCompleted = persistentRows.reduce((sum, row) => sum + row.totalCompleted, 0);
  const totalActual = persistentRows.reduce((sum, row) => sum + row.totalActual, 0);
  const totalAvailable = persistentRows.reduce((sum, row) => sum + row.stockAvailable, 0);
  const totalValue = persistentRows.reduce((sum, row) => sum + row.stockValue, 0);
  return <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>Rekap Stok</Text>
    <Text style={[styles.helper, { color: colors.muted }]}>Ringkasan stok tersedia dibaca dari Production Stock persistent backend.</Text>
    <Text style={[styles.label, { color: colors.foreground }]}>Filter Produk</Text><View style={styles.chipWrap}>{products.map((product) => <Chip key={product.id} label={product.name} selected={productFilter === product.id} onPress={() => setProductFilter(product.id)} colors={colors} />)}<Chip label="Semua Produk" selected={productFilter === "all"} onPress={() => setProductFilter("all")} colors={colors} /></View>
    <Text style={[styles.label, { color: colors.foreground }]}>Filter Periode</Text><View style={styles.chipWrap}>{PERIODS.map((period) => <Chip key={period} label={period === "all" ? "Semua Periode" : period} selected={periodFilter === period} onPress={() => setPeriodFilter(period)} colors={colors} />)}</View>
    {stockQuery.isLoading ? <Text style={[styles.state, { color: colors.muted }]}>Memuat rekap stok...</Text> : null}
    {stockQuery.isError ? <Text style={[styles.state, { color: colors.error }]}>Rekap stok belum dapat dimuat. Coba lagi nanti.</Text> : null}
    {!stockQuery.isLoading && !stockQuery.isError ? <>
      <View style={styles.metricGrid}><Metric label="Produksi Selesai" value={`${totalCompleted}`} colors={colors} /><Metric label="Total Hasil Aktual" value={`${totalActual} unit`} colors={colors} /><Metric label="Stok Tersedia" value={`${totalAvailable} unit`} colors={colors} /><Metric label="Nilai Stok" value={formatCurrency(totalValue)} colors={colors} /></View>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rincian per Produk</Text>{persistentRows.length ? persistentRows.map((row) => <View key={row.product.id} style={[styles.row, { borderTopColor: colors.border }]}><View style={styles.rowCopy}><Text style={[styles.productName, { color: colors.foreground }]}>{row.product.name}</Text><Text style={[styles.meta, { color: colors.muted }]}>Selesai {row.totalCompleted} · Hasil Aktual {row.totalActual} unit</Text><Text style={[styles.meta, { color: colors.muted }]}>HPP/Unit {formatCurrency(row.hppPerUnit)}</Text></View><View style={styles.rowRight}><Text style={[styles.stockValue, { color: colors.primary }]}>{row.stockAvailable} unit</Text><Text style={[styles.meta, { color: colors.muted }]}>{formatCurrency(row.stockValue)}</Text></View></View>) : <Text style={[styles.empty, { color: colors.muted }]}>Belum ada stok dari production stock persistent sesuai filter.</Text>}
    </> : null}
  </View>;
}
function Chip({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) { return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}14` : colors.background }, pressed && styles.pressed]}><Text style={[styles.chipText, { color: selected ? colors.primary : colors.muted }]}>{label}</Text></Pressable>; }
function Metric({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) { return <View style={[styles.metric, { borderColor: colors.border }]}><Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text></View>; }
function formatCurrency(value: number) { return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`; }
const styles = StyleSheet.create({ container: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 14 }, title: { fontSize: 19, fontWeight: "800" }, helper: { fontSize: 12, lineHeight: 18, marginTop: 5 }, label: { fontSize: 12, fontWeight: "800", marginTop: 16, marginBottom: 7 }, chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 }, chipText: { fontSize: 10, fontWeight: "700" }, metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 17, marginBottom: 18 }, metric: { width: "31.8%", minHeight: 70, borderWidth: 1, borderRadius: 11, padding: 9 }, metricLabel: { fontSize: 10, lineHeight: 14 }, metricValue: { fontSize: 13, fontWeight: "800", marginTop: 6 }, sectionTitle: { fontSize: 15, fontWeight: "800", marginBottom: 6 }, row: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11, marginTop: 5 }, rowCopy: { flex: 1 }, productName: { fontSize: 13, fontWeight: "800" }, meta: { fontSize: 10, marginTop: 3 }, rowRight: { alignItems: "flex-end", marginLeft: 8 }, stockValue: { fontSize: 14, fontWeight: "800" }, state: { fontSize: 12, lineHeight: 18, marginTop: 16 }, empty: { fontSize: 12, lineHeight: 18, paddingVertical: 12 }, pressed: { opacity: 0.78 },
});
