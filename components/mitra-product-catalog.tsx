import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { formatProductPrice } from "@/lib/mitra-products";
import { trpc } from "@/lib/trpc";

type Colors = ReturnType<typeof useColors>;

function formatStockValue(value: number | undefined, unit: string): string {
  return value === undefined ? "Belum tersedia" : `${value} ${unit}`;
}

export function MitraProductCatalog() {
  const colors = useColors();
  const productsQuery = trpc.products.list.useQuery(undefined);
  const hppQuery = trpc.hpp.list.useQuery();
  const stockQuery = trpc.mitraDashboard.stock.useQuery();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const products = productsQuery.data ?? [];
  const hppByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of hppQuery.data ?? []) map.set(row.productId, Number(row.costPerUnit));
    return map;
  }, [hppQuery.data]);
  const stockByProduct = useMemo(() => {
    const map = new Map<string, { stockQuantity: number; minimumStock: number }>();
    for (const item of stockQuery.data?.items ?? []) {
      if (item.productId) map.set(item.productId, { stockQuantity: item.stockQuantity, minimumStock: item.minimumStock });
    }
    return map;
  }, [stockQuery.data?.items]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.rowCopy}>
          <Text style={[styles.panelTitle, { color: colors.foreground }]}>Katalog Produk</Text>
          <Text style={[styles.panelHelper, { color: colors.muted }]}>Master produk yang ditugaskan kepada Anda.</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Muat ulang katalog produk" onPress={() => { void productsQuery.refetch(); void hppQuery.refetch(); void stockQuery.refetch(); }} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}>
          <AppIcon name="refresh" size={17} color={colors.primary} />
        </Pressable>
      </View>
      {productsQuery.isLoading || hppQuery.isLoading || stockQuery.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : productsQuery.error ? <ErrorState message={productsQuery.error.message} onRetry={() => void productsQuery.refetch()} colors={colors} /> : <FlatList data={products} keyExtractor={(item) => item.id} renderItem={({ item }) => <ProductCard product={item} hpp={hppByProduct.get(item.id)} stock={stockByProduct.get(item.id)} expanded={expandedId === item.id} onToggle={() => setExpandedId((current) => current === item.id ? null : item.id)} colors={colors} />} ListHeaderComponent={products.length ? <Text style={[styles.countText, { color: colors.muted }]}>{products.length} produk</Text> : null} ListEmptyComponent={<EmptyState colors={colors} />} showsVerticalScrollIndicator={false} />}
    </View>
  );
}

function ProductCard({ product, hpp, stock, expanded, onToggle, colors }: { product: { id: string; name: string; sku: string | null; unit: string; category: string | null; size: string | null; sellingPrice: number | null; lifecycleStatus: string; createdByMitraUserId: string | null; createdAt: string; updatedAt: string }; hpp: number | undefined; stock: { stockQuantity: number; minimumStock: number } | undefined; expanded: boolean; onToggle: () => void; colors: Colors }) {
  const price = product.sellingPrice;
  const margin = price != null && hpp !== undefined ? price - hpp : null;
  const active = product.lifecycleStatus === "active";
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={21} color={colors.primary} /></View>
        <View style={styles.rowCopy}>
          <Text style={[styles.productName, { color: colors.foreground }]}>{product.name}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>SKU: {product.sku ?? "-"}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>{product.category ?? "Tanpa kategori"} {product.size ? `· ${product.size}` : ""} · {product.unit}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: active ? `${colors.success}18` : `${colors.muted}18` }]}>
          <Text style={[styles.statusText, { color: active ? colors.success : colors.muted }]}>{active ? "AKTIF" : "NONAKTIF"}</Text>
        </View>
      </View>
      <View style={styles.financeBlock}>
        <InfoRow label="HPP" value={hpp !== undefined ? formatProductPrice(hpp) : "Belum tersedia"} colors={colors} />
        <InfoRow label="Harga Distributor" value={price != null ? formatProductPrice(price) : "Belum tersedia"} colors={colors} />
        <InfoRow label="Margin" value={margin != null ? formatProductPrice(margin) : "-"} colors={colors} />
      </View>
      <View style={[styles.stockBlock, { borderTopColor: colors.border }]}>
        <InfoRow label="Min. Stok" value={formatStockValue(stock?.minimumStock, product.unit)} colors={colors} />
        <InfoRow label="Stok Saat Ini" value={formatStockValue(stock?.stockQuantity, product.unit)} colors={colors} />
      </View>
      <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [styles.detailToggle, { borderTopColor: colors.border }, pressed && styles.pressed]}>
        <Text style={[styles.detailToggleText, { color: colors.primary }]}>{expanded ? "Sembunyikan Detail" : "Lihat Detail ›"}</Text>
        <AppIcon name="chevron-right" size={15} color={colors.primary} />
      </Pressable>
      {expanded ? <View style={[styles.detailBlock, { borderTopColor: colors.border }]}>
        <InfoRow label="ID Produk" value={product.id} colors={colors} />
        <InfoRow label="Dibuat oleh" value={product.createdByMitraUserId ? "Mitra" : "Distributor/Admin"} colors={colors} />
        <InfoRow label="Dibuat" value={new Date(product.createdAt).toLocaleDateString("id-ID")} colors={colors} />
        <InfoRow label="Diperbarui" value={new Date(product.updatedAt).toLocaleDateString("id-ID")} colors={colors} />
      </View> : null}
    </View>
  );
}

function InfoRow({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text></View>;
}

function ErrorState({ message, onRetry, colors }: { message: string; onRetry: () => void; colors: Colors }) {
  return <View style={[styles.stateCard, { backgroundColor: colors.background, borderColor: colors.border }]}><AppIcon name="inventory" size={27} color={colors.error} /><Text style={[styles.stateTitle, { color: colors.foreground }]}>Data belum dapat dimuat</Text><Text style={[styles.stateText, { color: colors.muted }]}>{message}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.retryText, { color: colors.primary }]}>Coba lagi</Text></Pressable></View>;
}

function EmptyState({ colors }: { colors: Colors }) {
  return <View style={[styles.stateCard, { backgroundColor: colors.background, borderColor: colors.border }]}><AppIcon name="inventory" size={27} color={colors.muted} /><Text style={[styles.stateTitle, { color: colors.foreground }]}>Belum ada produk di katalog Anda.</Text></View>;
}

const styles = StyleSheet.create({
  panel: { flex: 1, marginTop: 12 },
  panelHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rowCopy: { flex: 1 },
  panelTitle: { fontSize: 18, fontWeight: "800" },
  panelHelper: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  refreshButton: { width: 37, height: 37, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  center: { minHeight: 150, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 19, padding: 14, marginBottom: 11 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
  meta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  statusBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, alignSelf: "flex-start" },
  statusText: { fontSize: 10, fontWeight: "800" },
  financeBlock: { marginTop: 12, gap: 6 },
  stockBlock: { marginTop: 10, gap: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  infoLabel: { fontSize: 11, fontWeight: "700" },
  infoValue: { fontSize: 12, fontWeight: "800", textAlign: "right", flexShrink: 1 },
  detailToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 11, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth },
  detailToggleText: { fontSize: 11, fontWeight: "800" },
  detailBlock: { marginTop: 11, gap: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  stateCard: { borderWidth: 1, borderRadius: 15, padding: 18, alignItems: "center", justifyContent: "center", marginTop: 12 },
  stateTitle: { fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 9 },
  stateText: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 5 },
  retryButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12 },
  retryText: { fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.78 },
});