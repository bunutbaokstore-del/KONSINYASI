import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { StyleSheet, Text, View } from "react-native";

export function MitraProductionStock() {
  const colors = useColors();
  const stockQuery = trpc.mitraProductionStock.list.useQuery();
  const stockRows = stockQuery.data ?? [];
  const totalAvailable = stockRows.reduce((sum, row) => sum + row.availableQuantity, 0);

  return <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>Stok Hasil Produksi</Text>
    <Text style={[styles.helper, { color: colors.muted }]}>Stok tersedia dibaca dari Production Stock persistent backend.</Text>
    {stockQuery.isLoading ? <Text style={[styles.state, { color: colors.muted }]}>Memuat stok hasil produksi...</Text> : null}
    {stockQuery.isError ? <Text style={[styles.state, { color: colors.error }]}>Stok hasil produksi belum dapat dimuat. Coba lagi nanti.</Text> : null}
    {!stockQuery.isLoading && !stockQuery.isError ? <>
      <View style={[styles.totalCard, { backgroundColor: `${colors.primary}12` }]}><Text style={[styles.totalLabel, { color: colors.muted }]}>Total Stok Tersedia</Text><Text style={[styles.totalValue, { color: colors.primary }]}>{totalAvailable} unit</Text></View>
      {stockRows.length ? stockRows.map((row) => <View key={row.id} style={[styles.productCard, { borderTopColor: colors.border }]}>
        <View style={styles.productHeader}><View style={styles.productCopy}><Text style={[styles.productName, { color: colors.foreground }]}>{row.product?.name ?? "Produk tidak ditemukan"}</Text><Text style={[styles.productMeta, { color: colors.muted }]}>Produk dari Master Produk</Text></View><Text style={[styles.available, { color: colors.primary }]}>{row.availableQuantity} unit</Text></View>
        <View style={styles.detailRow}><StockDetail label="Stok Tersedia" value={`${row.availableQuantity} unit`} colors={colors} /><StockDetail label="Diperbarui" value={formatDate(row.updatedAt)} colors={colors} /></View>
      </View>) : <Text style={[styles.empty, { color: colors.muted }]}>Belum ada stok hasil produksi persistent.</Text>}
    </> : null}
  </View>;
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function StockDetail({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) { return <View style={styles.detail}><Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text></View>; }
const styles = StyleSheet.create({ container: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 14, marginBottom: 14 }, title: { fontSize: 19, fontWeight: "800" }, helper: { fontSize: 12, lineHeight: 18, marginTop: 5 }, state: { fontSize: 12, lineHeight: 18, marginTop: 16 }, totalCard: { borderRadius: 13, padding: 13, marginTop: 13 }, totalLabel: { fontSize: 11 }, totalValue: { fontSize: 23, fontWeight: "800", marginTop: 3 }, productCard: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 13, marginTop: 15 }, productHeader: { flexDirection: "row", alignItems: "center" }, productCopy: { flex: 1 }, productName: { fontSize: 14, fontWeight: "800" }, productMeta: { fontSize: 10, marginTop: 3 }, available: { fontSize: 15, fontWeight: "800" }, detailRow: { flexDirection: "row", gap: 9, marginTop: 12 }, detail: { flex: 1, borderRadius: 10, padding: 9, backgroundColor: "rgba(127, 127, 127, 0.08)" }, detailLabel: { fontSize: 10 }, detailValue: { fontSize: 12, fontWeight: "800", marginTop: 3 }, empty: { fontSize: 12, lineHeight: 18, marginTop: 16 },
});
