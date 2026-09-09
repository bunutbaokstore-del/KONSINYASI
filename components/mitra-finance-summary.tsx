import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import type { FinanceProductRow, FinanceSummary } from "@/lib/mitra-finance";

export type MitraFinanceStatus = "loading" | "ready" | "error";

const FINANCE_QUERY_PATHS: ReadonlyArray<readonly string[]> = [
  ["products", "list"],
  ["hpp", "list"],
  ["budgets", "list"],
  ["productionEvents", "list"],
  ["mitraShipments", "list"],
];

function matchesFinanceProcedure(queryKey: ReadonlyArray<unknown>): boolean {
  const path = queryKey[0];
  const meta = queryKey[1];
  if (!Array.isArray(path)) return false;
  if (typeof meta !== "object" || meta === null) return false;
  if ((meta as { type?: unknown }).type !== "query") return false;
  return FINANCE_QUERY_PATHS.some(
    (parts) => parts.length === path.length && parts.every((part, index) => path[index] === part),
  );
}

function resolveFinanceStatus(client: QueryClient): MitraFinanceStatus {
  const queries = client.getQueryCache().findAll().filter((query) => matchesFinanceProcedure(query.queryKey));
  if (queries.length === 0) return "loading";
  if (queries.some((query) => query.state.status === "error")) return "error";
  if (queries.some((query) => query.state.status === "pending" && query.state.fetchStatus === "fetching")) return "loading";
  return "ready";
}

export function useMitraFinanceStatus(): { status: MitraFinanceStatus; retry: () => void } {
  const client = useQueryClient();
  const status = useSyncExternalStore(
    (onStoreChange) => client.getQueryCache().subscribe(onStoreChange),
    () => resolveFinanceStatus(client),
    () => resolveFinanceStatus(client),
  );
  const retry = useCallback(() => {
    void client.refetchQueries({ predicate: (query) => matchesFinanceProcedure(query.queryKey) });
  }, [client]);
  return { status, retry };
}

export type MitraFinanceSummaryProps = {
  summary: FinanceSummary;
  status: MitraFinanceStatus;
  onRetry: () => void;
};

export function MitraFinanceSummary({ summary, status, onRetry }: MitraFinanceSummaryProps) {
  if (status === "error") return <FinanceErrorCard onRetry={onRetry} />;
  if (status === "loading") return <FinanceLoadingCard />;
  if (summary.rows.length === 0) return <FinanceEmptyCard />;
  return <FinanceSummaryContent summary={summary} />;
}

function FinanceLoadingCard() {
  const colors = useColors();
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.stateText, { color: colors.muted }]}>Memuat ringkasan keuangan...</Text>
    </View>
  );
}

function FinanceErrorCard({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppIcon name="help" size={26} color={colors.error} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>Data keuangan belum dapat dimuat</Text>
      <Text style={[styles.stateText, { color: colors.muted }]}>Ringkasan tidak dihitung karena salah satu sumber data gagal dimuat.</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, { borderColor: colors.primary }, pressed && styles.pressed]}>
        <AppIcon name="refresh" size={16} color={colors.primary} />
        <Text style={[styles.retryText, { color: colors.primary }]}>Coba lagi</Text>
      </Pressable>
    </View>
  );
}

function FinanceEmptyCard() {
  const colors = useColors();
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppIcon name="wallet" size={26} color={colors.muted} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>Belum ada data keuangan</Text>
      <Text style={[styles.stateText, { color: colors.muted }]}>Ringkasan akan tampil setelah HPP, Budget, Produksi, dan Pengiriman tersedia.</Text>
    </View>
  );
}

function FinanceSummaryContent({ summary }: { summary: FinanceSummary }) {
  const colors = useColors();
  const achievement = summary.productionAchievement;
  return (
    <View style={styles.container}>
      <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Ringkasan</Text>
      <View style={styles.metricGrid}>
        <Metric label="Periode Aktif" value={summary.activePeriod ?? "—"} icon="building" colors={colors} />
        <Metric label="Total Nilai Stok" value={formatCurrency(summary.totalStockValue)} icon="wallet" colors={colors} />
        <Metric label="Estimasi Pendapatan" value={formatCurrency(summary.estimatedRevenue)} icon="cart" colors={colors} />
        <Metric label="Total Terkirim" value={`${summary.totalShipped} unit`} icon="shippingbox" colors={colors} />
        <Metric label="Capaian Produksi" value={achievement ? `${achievement.percentage.toFixed(1)}%` : "—"} icon="verified" colors={colors} />
      </View>
      <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Detail Produk</Text>
      {summary.rows.map((row) => <ProductRowCard key={row.product.id} row={row} />)}
    </View>
  );
}

function Metric({ label, value, icon, colors }: { label: string; value: string; icon: AppIconName; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppIcon name={icon} size={18} color={colors.primary} />
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function ProductRowCard({ row }: { row: FinanceProductRow }) {
  const colors = useColors();
  const product = row.product;
  const meta = [product.category, product.unit].filter(Boolean).join(" · ");
  return (
    <View style={[styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.productHeader}>
        <View style={[styles.productIcon, { backgroundColor: `${colors.primary}16` }]}>
          <AppIcon name="inventory" size={18} color={colors.primary} />
        </View>
        <View style={styles.productCopy}>
          <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
          {meta ? <Text style={[styles.productMeta, { color: colors.muted }]}>{meta}</Text> : null}
        </View>
        <Text style={[styles.productStatus, { color: product.status === "Aktif" ? colors.success : colors.muted }]}>{product.status}</Text>
      </View>
      <View style={styles.detailGrid}>
        <Detail label="Harga jual" value={formatCurrency(row.sellingPrice)} colors={colors} />
        <Detail label="HPP per unit" value={formatCurrency(row.hppPerUnit)} colors={colors} />
        <Detail label="Stok masuk" value={`${row.stockIn} unit`} colors={colors} />
        <Detail label="Stok tersedia" value={`${row.availableStock} unit`} colors={colors} />
        <Detail label="Nilai stok" value={formatCurrency(row.stockValue)} colors={colors} />
        <Detail label="Qty terkirim" value={`${row.shippedQuantity} unit`} colors={colors} />
        <Detail label="Target produksi" value={`${row.targetQuantity} unit`} colors={colors} />
        <Detail label="Hasil aktual" value={`${row.actualQuantity} unit`} colors={colors} />
        <Detail label="Capaian produksi" value={`${row.achievementPercentage.toFixed(1)}%`} colors={colors} />
        <Detail label="Estimasi pendapatan" value={formatCurrency(row.estimatedRevenue)} colors={colors} />
        <Detail label="Margin estimasi" value={formatSignedCurrency(row.marginEstimasi)} colors={colors} />
      </View>
    </View>
  );
}

function Detail({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.detail}>
      <Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function formatCurrency(value: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`;
}

function formatSignedCurrency(value: number) {
  const prefix = value < 0 ? "-" : "";
  return `${prefix}Rp ${new Intl.NumberFormat("id-ID").format(Math.round(Math.abs(value)))}`;
}

const styles = StyleSheet.create({
  container: { marginTop: 20, paddingBottom: 8 },
  stateCard: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: "center", gap: 9, marginTop: 14 },
  stateTitle: { fontSize: 14, fontWeight: "800" },
  stateText: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  retryButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  retryText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.7 },
  sectionLabel: { fontSize: 12, fontWeight: "800", marginTop: 18, marginBottom: 8 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { width: "31.5%", minHeight: 100, borderWidth: 1, borderRadius: 14, padding: 10 },
  metricLabel: { fontSize: 10, lineHeight: 14, marginTop: 9 },
  metricValue: { fontSize: 13, fontWeight: "800", marginTop: 4 },
  productCard: { borderWidth: 1, borderRadius: 16, padding: 13, marginTop: 12 },
  productHeader: { flexDirection: "row", alignItems: "center" },
  productIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", marginRight: 10 },
  productCopy: { flex: 1 },
  productName: { fontSize: 14, fontWeight: "800" },
  productMeta: { fontSize: 11, marginTop: 3 },
  productStatus: { fontSize: 10, fontWeight: "800" },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 12 },
  detail: { width: "48.5%" },
  detailLabel: { fontSize: 10 },
  detailValue: { fontSize: 13, fontWeight: "700", marginTop: 3 },
});