import { AdminRouteGuard } from "@/components/admin-route-guard";
import { AppIcon } from "@/components/ui/app-icon";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

type LifecycleFilter = "all" | "active" | "inactive";

const FILTERS: Array<{ key: LifecycleFilter; label: string }> = [
  { key: "all", label: "Semua Produk" },
  { key: "active", label: "Produk Aktif" },
  { key: "inactive", label: "Produk Nonaktif" },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminProductsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<LifecycleFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const productsQuery = trpc.products.list.useQuery(
    { lifecycleStatus: filter === "all" ? undefined : filter, search: search.trim() || undefined },
    { enabled: isAuthenticated },
  );
  const detailQuery = trpc.products.detail.useQuery(
    { productId: selectedProductId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: isAuthenticated && Boolean(selectedProductId) },
  );

  if (selectedProductId) {
    return (
      <AdminRouteGuard>
        <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke katalog" onPress={() => setSelectedProductId(null)} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
              <AppIcon name="chevron-left" size={21} color={colors.foreground} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>KATALOG PRODUK</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Detail Produk</Text>
            </View>
          </View>
          {detailQuery.isLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : detailQuery.error ? (
            <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AppIcon name="inventory" size={28} color={colors.error} />
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>Detail belum dapat dimuat</Text>
              <Text style={[styles.stateText, { color: colors.muted }]}>{detailQuery.error.message}</Text>
              <Pressable accessibilityRole="button" onPress={() => void detailQuery.refetch()} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.primary }, pressed && styles.pressed]}>
                <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Coba lagi</Text>
              </Pressable>
            </View>
          ) : detailQuery.data ? (
            <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.detailIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={25} color={colors.primary} /></View>
              <Text style={[styles.detailName, { color: colors.foreground }]}>{detailQuery.data.name}</Text>
              <View style={[styles.statusPill, { backgroundColor: detailQuery.data.lifecycleStatus === "active" ? `${colors.success}18` : `${colors.muted}18` }]}>
                <Text style={[styles.statusText, { color: detailQuery.data.lifecycleStatus === "active" ? colors.success : colors.muted }]}>{detailQuery.data.lifecycleStatus === "active" ? "Aktif" : "Nonaktif"}</Text>
              </View>
              <View style={styles.detailRows}>
                <DetailRow label="SKU" value={detailQuery.data.sku ?? "Tidak tersedia"} colors={colors} />
                <DetailRow label="Unit" value={detailQuery.data.unit} colors={colors} />
                <DetailRow label="Dibuat" value={formatDate(detailQuery.data.createdAt)} colors={colors} />
                <DetailRow label="Diperbarui" value={formatDate(detailQuery.data.updatedAt)} colors={colors} />
              </View>
            </View>
          ) : null}
        </ScreenContainer>
      </AdminRouteGuard>
    );
  }

  return (
    <AdminRouteGuard>
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
        <FlatList
          data={productsQuery.data ?? []}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={(productsQuery.data?.length ?? 0) > 0 ? styles.listContent : styles.emptyContent}
          refreshControl={<RefreshControl refreshing={productsQuery.isRefetching} onRefresh={() => void productsQuery.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke Operasional" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
                  <AppIcon name="chevron-left" size={21} color={colors.foreground} />
                </Pressable>
                <View style={styles.headerCopy}>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG OPERASIONAL</Text>
                  <Text style={[styles.title, { color: colors.foreground }]}>Katalog Produk</Text>
                </View>
                <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={21} color={colors.primary} /></View>
              </View>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Product Master dalam workspace Anda. Katalog ini bersifat monitoring untuk Admin.</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Cari nama atau SKU"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                style={[styles.searchInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              <FlatList
                horizontal
                data={FILTERS}
                keyExtractor={(item) => item.key}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterList}
                renderItem={({ item }) => (
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === item.key }} onPress={() => setFilter(item.key)} style={({ pressed }) => [styles.filterChip, { borderColor: filter === item.key ? colors.primary : colors.border, backgroundColor: filter === item.key ? `${colors.primary}16` : colors.surface }, pressed && styles.pressed]}>
                    <Text style={[styles.filterText, { color: filter === item.key ? colors.primary : colors.muted }]}>{item.label}</Text>
                  </Pressable>
                )}
              />
              <View style={styles.sectionHeader}>
                <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{FILTERS.find((item) => item.key === filter)?.label}</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{productsQuery.data?.length ?? 0} produk ditemukan</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Muat ulang katalog" onPress={() => void productsQuery.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={18} color={colors.primary} /></Pressable>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Lihat detail ${item.name}`} onPress={() => setSelectedProductId(item.id)} style={({ pressed }) => [styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
              <View style={[styles.productIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={21} color={colors.primary} /></View>
              <View style={styles.productCopy}>
                <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={2}>{item.name}</Text>
                <Text style={[styles.productMeta, { color: colors.muted }]}>{item.sku ?? "SKU tidak tersedia"} · {item.unit}</Text>
                <Text style={[styles.productUpdated, { color: colors.muted }]}>Diperbarui {formatDate(item.updatedAt)}</Text>
              </View>
              <View style={styles.productAside}>
                <Text style={[styles.statusText, { color: item.lifecycleStatus === "active" ? colors.success : colors.muted }]}>{item.lifecycleStatus === "active" ? "Aktif" : "Nonaktif"}</Text>
                <AppIcon name="chevron-right" size={18} color={colors.muted} />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            productsQuery.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : productsQuery.error ? (
              <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppIcon name="inventory" size={28} color={colors.error} /><Text style={[styles.stateTitle, { color: colors.foreground }]}>Katalog belum dapat dimuat</Text><Text style={[styles.stateText, { color: colors.muted }]}>{productsQuery.error.message}</Text><Pressable accessibilityRole="button" onPress={() => void productsQuery.refetch()} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.outlineButtonText, { color: colors.primary }]}>Coba lagi</Text></Pressable></View>
            ) : <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppIcon name="inventory" size={28} color={colors.muted} /><Text style={[styles.stateTitle, { color: colors.foreground }]}>Belum ada produk</Text><Text style={[styles.stateText, { color: colors.muted }]}>{search.trim() ? "Tidak ada produk yang cocok dengan pencarian." : "Product Master dalam workspace ini belum tersedia."}</Text></View>
          }
        />
      </ScreenContainer>
    </AdminRouteGuard>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.detailRow, { borderBottomColor: colors.border }]}><Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingTop: 8 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, marginLeft: 14 },
  headerIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: "800", marginTop: 2 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 16 },
  searchInput: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13 },
  filterList: { gap: 8, paddingVertical: 14 },
  filterChip: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9 },
  filterText: { fontSize: 12, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, marginTop: 3 },
  refreshButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: 28 },
  emptyContent: { flexGrow: 1, paddingBottom: 28 },
  productCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  productIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  productCopy: { flex: 1, marginLeft: 12, marginRight: 8 },
  productName: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
  productMeta: { fontSize: 12, marginTop: 4 },
  productUpdated: { fontSize: 10, marginTop: 5 },
  productAside: { alignItems: "flex-end", gap: 9 },
  statusText: { fontSize: 11, fontWeight: "800" },
  center: { flex: 1, minHeight: 180, alignItems: "center", justifyContent: "center" },
  stateCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: "center", justifyContent: "center", marginTop: 12 },
  stateTitle: { fontSize: 15, fontWeight: "800", marginTop: 12, textAlign: "center" },
  stateText: { fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: "center" },
  outlineButton: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9, marginTop: 14 },
  outlineButtonText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  detailCard: { borderWidth: 1, borderRadius: 20, padding: 18, marginTop: 20 },
  detailIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  detailName: { fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 16 },
  statusPill: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10 },
  detailRows: { marginTop: 18 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, paddingVertical: 12 },
  detailLabel: { fontSize: 12 },
  detailValue: { flex: 1, fontSize: 12, fontWeight: "700", textAlign: "right" },
});
