import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

type Movement = { id: string; itemId: string; previousStock: number; changeQuantity: number; resultingStock: number; movementType: string; reason: string; createdAt: string };

export default function StockHistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const query = trpc.stockMovements.list.useQuery();
  const movements = (query.data ?? []) as Movement[];

  return (
    <ScreenContainer className="px-5">
      <FlatList
        data={movements}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} colors={[colors.primary]} tintColor={colors.primary} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<View><View style={styles.headerRow}><Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="arrow-back" size={20} color={colors.foreground} /></Pressable><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>KONSINYASI</Text><Text style={[styles.title, { color: colors.foreground }]}>Riwayat stok</Text></View><AppIcon name="inventory" size={22} color={colors.primary} /></View><Text style={[styles.subtitle, { color: colors.muted }]}>Catatan perubahan stok yang telah disetujui Admin.</Text>{query.error ? <Text style={[styles.errorText, { color: colors.error }]}>{query.error.message}</Text> : null}</View>}
        ListEmptyComponent={query.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={[styles.emptyText, { color: colors.muted }]}>Memuat riwayat stok…</Text></View> : <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Belum ada riwayat stok</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Audit akan muncul setelah pengajuan stok disetujui.</Text></View>}
        renderItem={({ item }) => <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.cardTop}><Text style={[styles.type, { color: colors.foreground }]}>{item.movementType === "initial_stock" ? "Stok awal barang" : "Perubahan stok supplier"}</Text><Text style={[styles.date, { color: colors.muted }]}>{new Date(item.createdAt).toLocaleDateString("id-ID")}</Text></View><Text style={[styles.stockFlow, { color: colors.foreground }]}>{item.previousStock} → {item.resultingStock} unit <Text style={{ color: item.changeQuantity >= 0 ? colors.success : colors.error }}>({item.changeQuantity >= 0 ? "+" : ""}{item.changeQuantity})</Text></Text><Text style={[styles.reason, { color: colors.muted }]}>{item.reason}</Text></View>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 36 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 },
  backButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 26, fontWeight: "800", marginTop: 2 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 14, marginBottom: 18 },
  errorText: { fontSize: 13, marginBottom: 14 },
  center: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13, lineHeight: 19 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12, gap: 8 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  type: { flex: 1, fontSize: 14, fontWeight: "800" },
  date: { fontSize: 11 },
  stockFlow: { fontSize: 19, fontWeight: "800" },
  reason: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
