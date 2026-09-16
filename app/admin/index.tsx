import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { BellButton } from "@/components/ui/bell-button";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { supplierRequestStatusLabel } from "@/lib/supplier-request-review-model";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type SupplierRequestActivity = {
  id: string;
  requestType: string;
  proposedName: string | null;
  itemId: string | null;
  status: string;
  createdAt: string;
};

function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminHomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();

  const requestsQuery = trpc.supplier.requests.useQuery();
  const inventoryQuery = trpc.inventory.list.useQuery();
  const wilayahQuery = trpc.distribution.listWilayah.useQuery();
  const productsQuery = trpc.products.list.useQuery();

  const requests = (requestsQuery.data ?? []) as SupplierRequestActivity[];
  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const recentActivity = requests.slice(0, 4);
  const items = inventoryQuery.data ?? [];
  const itemCount = items.length;
  const totalUnits = items.reduce((sum, item) => sum + item.stockQuantity, 0);
  const wilayahCount = (wilayahQuery.data ?? []).length;
  const productCount = (productsQuery.data ?? []).length;

  const kpi = [
    { label: "Pengajuan menunggu", value: requestsQuery.isLoading ? "–" : Math.max(pendingCount, 0), color: pendingCount > 0 ? colors.warning : colors.foreground, icon: "send" as const, onPress: () => router.push("/supplier-requests") },
    { label: "Barang titipan", value: inventoryQuery.isLoading ? "–" : itemCount, color: colors.foreground, icon: "inventory" as const, onPress: () => router.push("/manage-inventory") },
    { label: "Total unit stok", value: inventoryQuery.isLoading ? "–" : totalUnits, color: colors.foreground, icon: "cart" as const, onPress: () => router.push("/manage-inventory") },
    { label: "Wilayah terdaftar", value: wilayahQuery.isLoading ? "–" : wilayahCount, color: colors.foreground, icon: "map" as const, onPress: () => router.push("/admin/wilayah") },
    { label: "Produk katalog", value: productsQuery.isLoading ? "–" : productCount, color: colors.foreground, icon: "shippingbox" as const, onPress: () => router.push("/admin/products") },
  ];

  const name = user?.name?.trim() || "Admin";

  return (
    <ScreenContainer className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG ADMIN</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Beranda</Text>
            </View>
            <BellButton />
          </View>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Rangkuman pengajuan, stok, dan struktur wilayah ruang kerja Anda.</Text>

          <View style={[styles.welcomeCard, { backgroundColor: colors.primary }]}>
            <Text style={[styles.welcomeEyebrow, { color: "#D9EFE5" }]}>SELAMAT DATANG</Text>
            <Text style={[styles.welcomeText, { color: colors.background }]}>{name}</Text>
            <Text style={[styles.welcomeHint, { color: "#D9EFE5" }]}>Tinjau pengajuan Mitra UMKM dan pantau operasional ruang kerja dari satu tempat.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>RINGKASAN</Text>
          <View style={styles.kpiGrid}>
            {kpi.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={item.onPress}
                style={({ pressed }) => [styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
              >
                <View style={[styles.kpiIcon, { backgroundColor: `${colors.primary}16` }]}>
                  <AppIcon name={item.icon} size={18} color={colors.primary} />
                </View>
                <Text style={[styles.kpiValue, { color: item.color }]}>{item.value}</Text>
                <Text style={[styles.kpiLabel, { color: colors.muted }]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>AKTIVITAS TERBARU</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Lihat semua pengajuan" onPress={() => router.push("/supplier-requests")} style={({ pressed }) => [styles.viewAllButton, pressed && styles.pressed]}>
              <Text style={[styles.viewAllText, { color: colors.primary }]}>Semua</Text>
            </Pressable>
          </View>

          {requestsQuery.isLoading ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : requestsQuery.error ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AppIcon name="refresh" size={28} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Aktivitas belum dapat dimuat</Text>
              <Pressable accessibilityRole="button" onPress={() => void requestsQuery.refetch()} style={({ pressed }) => [styles.retryButton, { borderColor: colors.primary }, pressed && styles.pressed]}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Coba lagi</Text>
              </Pressable>
            </View>
          ) : recentActivity.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AppIcon name="send" size={28} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Belum ada aktivitas</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>Pengajuan Mitra UMKM akan tampil di sini setelah tersedia.</Text>
            </View>
          ) : (
            <View style={[styles.activityCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {recentActivity.map((activity, index) => (
                <Pressable
                  key={activity.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Detail pengajuan ${activity.requestType === "new_item" ? "barang baru" : "perubahan stok"}`}
                  onPress={() => router.push("/supplier-requests")}
                  style={({ pressed }) => [
                    styles.activityRow,
                    { borderBottomColor: colors.border, borderBottomWidth: index < recentActivity.length - 1 ? StyleSheet.hairlineWidth : 0 },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={[styles.activityIcon, { backgroundColor: `${colors.primary}16` }]}>
                    <AppIcon name={activity.requestType === "new_item" ? "add" : "refresh"} size={18} color={colors.primary} />
                  </View>
                  <View style={styles.activityCopy}>
                    <View style={styles.activityTop}>
                      <Text numberOfLines={1} style={[styles.activityTitle, { color: colors.foreground }]}>
                        {activity.requestType === "new_item" ? "Pengajuan barang baru" : "Perubahan stok"}
                      </Text>
                      <Text
                        style={[
                          styles.activityStatus,
                          { color: activity.status === "approved" ? colors.success : activity.status === "rejected" ? colors.error : colors.warning },
                        ]}
                      >
                        {supplierRequestStatusLabel(activity.status)}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={[styles.activityMeta, { color: colors.muted }]}>
                      {activity.proposedName ?? (activity.itemId ? "Barang titipan yang diajukan" : "Pengajuan dari Mitra UMKM")} · {formatActivityDate(activity.createdAt)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 48 },
  content: { paddingTop: 14 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerCopy: { flex: 1, paddingRight: 12 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.7, marginBottom: 7 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  welcomeCard: { borderRadius: 24, padding: 20, marginTop: 18 },
  welcomeEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  welcomeText: { fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 7 },
  welcomeHint: { fontSize: 12, lineHeight: 18, marginTop: 7 },
  section: { marginTop: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3 },
  viewAllButton: { paddingVertical: 4, paddingLeft: 12 },
  viewAllText: { fontSize: 12, fontWeight: "800" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  kpiCard: { width: "48%", borderRadius: 18, borderWidth: 1, padding: 13, gap: 6 },
  kpiIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  kpiValue: { fontSize: 22, fontWeight: "800", marginTop: 2 },
  kpiLabel: { fontSize: 10, lineHeight: 14 },
  activityCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, marginTop: 10 },
  activityRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13 },
  activityIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  activityCopy: { flex: 1, marginLeft: 11, paddingRight: 4 },
  activityTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  activityTitle: { fontSize: 13, fontWeight: "800", flexShrink: 1 },
  activityStatus: { fontSize: 11, fontWeight: "800" },
  activityMeta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  emptyCard: { borderWidth: 1, borderRadius: 18, alignItems: "center", padding: 22, marginTop: 10 },
  emptyTitle: { fontSize: 14, fontWeight: "800", marginTop: 9 },
  emptyText: { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 5 },
  retryButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8, marginTop: 12 },
  retryText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
});