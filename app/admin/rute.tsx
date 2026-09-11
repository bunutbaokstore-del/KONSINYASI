import { AdminRouteGuard } from "@/components/admin-route-guard";
import { AppIcon } from "@/components/ui/app-icon";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { OutletRecord, SalesRecord } from "@/shared/distribution";

type PickerState =
  | { type: "outlet-add" }
  | { type: "outlet-move"; outlet: OutletRecord }
  | { type: "sales-add" }
  | { type: "sales-move"; sales: SalesRecord }
  | null;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminRuteScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ ruteId: string }>();
  const ruteId = typeof params.ruteId === "string" ? params.ruteId : "";
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const [picker, setPicker] = useState<PickerState>(null);
  const [search, setSearch] = useState("");

  const ruteQuery = trpc.distribution.getRute.useQuery({ ruteId }, { enabled: isAuthenticated && Boolean(ruteId) });
  const historyQuery = trpc.distribution.getAssignmentHistory.useQuery({ ruteId }, { enabled: isAuthenticated && Boolean(ruteId) });
  const outletQuery = trpc.distribution.listOutlet.useQuery({ search: search.trim() || undefined }, { enabled: isAuthenticated && (picker?.type === "outlet-add" || picker?.type === "outlet-move") });
  const salesQuery = trpc.distribution.listSales.useQuery({ search: search.trim() || undefined }, { enabled: isAuthenticated && (picker?.type === "sales-add" || picker?.type === "sales-move") });
  const ruteOptionsQuery = trpc.distribution.listRute.useQuery(undefined, { enabled: isAuthenticated && (picker?.type === "outlet-move" || picker?.type === "sales-move") });

  const setActiveMutation = trpc.distribution.setRuteActive.useMutation();
  const assignOutletMutation = trpc.distribution.assignOutletToRute.useMutation();
  const reassignOutletMutation = trpc.distribution.reassignOutlet.useMutation();
  const assignSalesMutation = trpc.distribution.assignSalesToRute.useMutation();
  const reassignSalesMutation = trpc.distribution.reassignSales.useMutation();

  const invalidateAll = () => {
    void utils.distribution.invalidate();
  };

  const rute = ruteQuery.data;
  const pickerTitle = picker?.type === "outlet-add" ? "Tambah Outlet" : picker?.type === "outlet-move" ? `Pindah ${picker.outlet.nama}` : picker?.type === "sales-add" ? "Tambah Sales" : picker?.type === "sales-move" ? `Pindah ${picker.sales.nama}` : "";
  const movingError = picker?.type === "outlet-add" ? assignOutletMutation.error?.message : picker?.type === "outlet-move" ? reassignOutletMutation.error?.message : picker?.type === "sales-add" ? assignSalesMutation.error?.message : picker?.type === "sales-move" ? reassignSalesMutation.error?.message : null;

  let options: { id: string; label: string; sublabel: string; disabled?: boolean }[] = [];
  if (picker?.type === "outlet-add") {
    options = (outletQuery.data ?? [])
      .filter((outlet) => outlet.activeRuteId !== ruteId && outlet.isActive)
      .map((outlet) => ({ id: outlet.id, label: outlet.nama, sublabel: `${outlet.kode} · ${outlet.alamatSingkat}${outlet.activeRuteNama ? ` · di ${outlet.activeRuteNama}` : ""}` }));
  } else if (picker?.type === "outlet-move") {
    options = (ruteOptionsQuery.data ?? [])
      .filter((candidate) => candidate.id !== ruteId && candidate.isActive)
      .map((candidate) => ({ id: candidate.id, label: candidate.nama, sublabel: `${candidate.kode} · ${candidate.outletCount} outlet` }));
  } else if (picker?.type === "sales-add") {
    options = (salesQuery.data ?? [])
      .filter((sales) => sales.activeRuteId !== ruteId)
      .map((sales) => ({ id: sales.id, label: sales.nama, sublabel: sales.activeRuteNama ? `Sales di ${sales.activeRuteNama}` : sales.email ?? "Sales Motoris" }));
  } else if (picker?.type === "sales-move") {
    options = (ruteOptionsQuery.data ?? [])
      .filter((candidate) => candidate.id !== ruteId && candidate.isActive)
      .map((candidate) => ({ id: candidate.id, label: candidate.nama, sublabel: `${candidate.kode} · ${candidate.salesCount} sales` }));
  }

  const pickOption = (id: string) => {
    if (!picker || !rute) return;
    if (picker.type === "outlet-add") {
      assignOutletMutation.mutate({ outletId: id, ruteId }, { onSuccess: () => { setPicker(null); setSearch(""); invalidateAll(); } });
    } else if (picker.type === "outlet-move") {
      reassignOutletMutation.mutate({ outletId: picker.outlet.id, ruteId: id }, { onSuccess: () => { setPicker(null); setSearch(""); invalidateAll(); } });
    } else if (picker.type === "sales-add") {
      assignSalesMutation.mutate({ salesId: id, ruteId }, { onSuccess: () => { setPicker(null); setSearch(""); invalidateAll(); } });
    } else if (picker.type === "sales-move") {
      reassignSalesMutation.mutate({ salesId: picker.sales.id, ruteId: id }, { onSuccess: () => { setPicker(null); setSearch(""); invalidateAll(); } });
    }
  };

  return (
    <AdminRouteGuard>
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke wilayah" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
              <AppIcon name="chevron-left" size={21} color={colors.foreground} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>DETAIL RUTE</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Rute</Text>
            </View>
          </View>

          {ruteQuery.isLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
          ) : ruteQuery.error || !rute ? (
            <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AppIcon name="shippingbox" size={28} color={colors.error} />
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>Rute belum dapat dimuat</Text>
              <Text style={[styles.stateText, { color: colors.muted }]}>{ruteQuery.error?.message ?? "Rute tidak ditemukan."}</Text>
              <Pressable accessibilityRole="button" onPress={() => void ruteQuery.refetch()} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.outlineButtonText, { color: colors.primary }]}>Coba lagi</Text></Pressable>
            </View>
          ) : (
            <View>
              <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.detailHeaderRow}>
                  <View style={[styles.detailIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="shippingbox" size={25} color={colors.primary} /></View>
                  <View style={styles.detailTitleCopy}>
                    <Text style={[styles.detailName, { color: colors.foreground }]}>{rute.rute.nama}</Text>
                    <Text style={[styles.kodeText, { color: colors.muted }]}>{rute.rute.kode} · {rute.wilayah.nama}</Text>
                  </View>
                  <AppIcon name="chevron-right" size={18} color={colors.muted} />
                </View>
                <View style={styles.detailSubRow}>
                  <View style={[styles.statusPill, { backgroundColor: rute.rute.isActive ? `${colors.success}18` : `${colors.muted}18` }]}>
                    <Text style={[styles.statusText, { color: rute.rute.isActive ? colors.success : colors.muted }]}>{rute.rute.isActive ? "Aktif" : "Nonaktif"}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => setActiveMutation.mutate({ ruteId, isActive: !rute.rute.isActive }, { onSuccess: invalidateAll })} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.border, marginTop: 0, paddingVertical: 6 }, pressed && styles.pressed]}>
                    <Text style={[styles.outlineButtonText, { color: colors.muted }]}>{rute.rute.isActive ? "Nonaktifkan" : "Aktifkan"}</Text>
                  </Pressable>
                </View>
                {rute.rute.keterangan ? <Text style={[styles.detailNote, { color: colors.muted }]}>{rute.rute.keterangan}</Text> : null}
                <DetailRow label="Jumlah Outlet" value={`${rute.outletCount}`} colors={colors} />
                <DetailRow label="Jumlah Sales" value={`${rute.salesCount}`} colors={colors} />
                <DetailRow label="Dibuat" value={formatDate(rute.rute.createdAt)} colors={colors} />
              </View>

              {picker ? (
                <View style={[styles.pickerCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                  <View style={styles.pickerHeader}>
                    <View style={styles.pickerCopy}>
                      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{pickerTitle}</Text>
                      <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Pilih tujuan pada daftar di bawah.</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="Tutup pemilih" onPress={() => { setPicker(null); setSearch(""); }} style={({ pressed }) => [styles.iconButton, { borderColor: colors.border }, pressed && styles.pressed]}>
                      <AppIcon name="close" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                  <TextInput value={search} onChangeText={setSearch} placeholder="Cari..." placeholderTextColor={colors.muted} returnKeyType="search" style={[styles.searchInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
                  {movingError ? <Text style={[styles.formError, { color: colors.error }]}>{movingError}</Text> : null}
                  {options.map((option) => (
                    <Pressable key={option.id} accessibilityRole="button" disabled={option.disabled} onPress={() => pickOption(option.id)} style={({ pressed }) => [styles.optionRow, { borderColor: colors.border }, pressed && styles.pressed, option.disabled && styles.disabled]}>
                      <View style={[styles.optionIcon, { backgroundColor: `${colors.primary}14` }]}><AppIcon name="chevron-right" size={14} color={colors.primary} /></View>
                      <View style={styles.optionCopy}>
                        <Text style={[styles.optionLabel, { color: colors.foreground }]}>{option.label}</Text>
                        <Text style={[styles.optionSublabel, { color: colors.muted }]} numberOfLines={2}>{option.sublabel}</Text>
                      </View>
                    </Pressable>
                  ))}
                  {options.length === 0 ? (
                    <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>Tidak ada pilihan yang cocok.</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.sectionHeader}>
                <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daftar Outlet</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{rute.outlets.length} outlet dalam rute ini</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Tambah outlet" onPress={() => { setPicker({ type: "outlet-add" }); setSearch(""); }} style={({ pressed }) => [styles.addSmallButton, { backgroundColor: `${colors.primary}16`, borderColor: colors.primary }, pressed && styles.pressed]}>
                  <AppIcon name="add" size={16} color={colors.primary} />
                  <Text style={[styles.addSmallText, { color: colors.primary }]}>Outlet</Text>
                </Pressable>
              </View>
              {rute.outlets.map((outlet) => (
                <View key={outlet.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.cardIcon, { backgroundColor: `${colors.success}16` }]}><AppIcon name="building" size={20} color={colors.success} /></View>
                  <View style={styles.cardCopy}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{outlet.nama}</Text>
                    <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={2}>{outlet.kode} · {outlet.alamatSingkat}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Pindah ${outlet.nama}`} onPress={() => { setPicker({ type: "outlet-move", outlet }); setSearch(""); }} style={({ pressed }) => [styles.moveButton, { borderColor: colors.primary }, pressed && styles.pressed]}>
                    <Text style={[styles.moveButtonText, { color: colors.primary }]}>Pindah</Text>
                  </Pressable>
                </View>
              ))}
              {rute.outlets.length === 0 ? (
                <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <AppIcon name="building" size={26} color={colors.muted} />
                  <Text style={[styles.stateText, { color: colors.muted }]}>Belum ada outlet pada rute ini.</Text>
                </View>
              ) : null}

              <View style={styles.sectionHeader}>
                <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daftar Sales</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{rute.sales.length} sales dalam rute ini</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Tambah sales" onPress={() => { setPicker({ type: "sales-add" }); setSearch(""); }} style={({ pressed }) => [styles.addSmallButton, { backgroundColor: `${colors.primary}16`, borderColor: colors.primary }, pressed && styles.pressed]}>
                  <AppIcon name="add" size={16} color={colors.primary} />
                  <Text style={[styles.addSmallText, { color: colors.primary }]}>Sales</Text>
                </Pressable>
              </View>
              {rute.sales.map((sales) => (
                <View key={sales.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.cardIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="person" size={20} color={colors.primary} /></View>
                  <View style={styles.cardCopy}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{sales.nama}</Text>
                    <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={2}>{sales.email ?? "Sales Motoris"}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Pindah ${sales.nama}`} onPress={() => { setPicker({ type: "sales-move", sales }); setSearch(""); }} style={({ pressed }) => [styles.moveButton, { borderColor: colors.primary }, pressed && styles.pressed]}>
                    <Text style={[styles.moveButtonText, { color: colors.primary }]}>Pindah</Text>
                  </Pressable>
                </View>
              ))}
              {rute.sales.length === 0 ? (
                <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <AppIcon name="person" size={26} color={colors.muted} />
                  <Text style={[styles.stateText, { color: colors.muted }]}>Belum ada sales pada rute ini.</Text>
                </View>
              ) : null}

              <View style={styles.sectionHeader}>
                <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Riwayat Penugasan</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{historyQuery.data?.length ?? 0} catatan</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Muat ulang riwayat" onPress={() => void historyQuery.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={17} color={colors.primary} /></Pressable>
              </View>
              {historyQuery.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : historyQuery.error ? (
                <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.stateText, { color: colors.muted }]}>{historyQuery.error.message}</Text>
                </View>
              ) : (historyQuery.data ?? []).length === 0 ? (
                <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <AppIcon name="refresh" size={24} color={colors.muted} />
                  <Text style={[styles.stateText, { color: colors.muted }]}>Belum ada riwayat penugasan untuk rute ini.</Text>
                </View>
              ) : (historyQuery.data ?? []).map((entry) => (
                <View key={entry.id} style={[styles.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.historyIcon, { backgroundColor: `${colors.primary}14` }]}><AppIcon name={entry.entityType === "outlet" ? "building" : "person"} size={17} color={colors.primary} /></View>
                  <View style={styles.historyCopy}>
                    <Text style={[styles.historyTitle, { color: colors.foreground }]} numberOfLines={1}>{entry.entityName}</Text>
                    <Text style={[styles.historyMeta, { color: colors.muted }]} numberOfLines={2}>
                      {entry.action === "assign" ? `Ditugaskan ke ${entry.toRuteNama ?? "Rute"}` : entry.action === "reassign" ? `Dipindah dari ${entry.fromRuteNama ?? "Rute"} ke ${entry.toRuteNama ?? "Rute"}` : `Dilepas dari ${entry.fromRuteNama ?? "Rute"}`} · {entry.changedByName} · {formatDate(entry.changedAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </ScreenContainer>
    </AdminRouteGuard>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.detailRow, { borderBottomColor: colors.border }]}><Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 8 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, marginLeft: 14 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: "800", marginTop: 2 },
  center: { flex: 1, minHeight: 180, alignItems: "center", justifyContent: "center" },
  stateCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: "center", justifyContent: "center", marginTop: 12 },
  stateTitle: { fontSize: 15, fontWeight: "800", marginTop: 12, textAlign: "center" },
  stateText: { fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: "center" },
  outlineButton: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9, marginTop: 14 },
  outlineButtonText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
  detailCard: { borderWidth: 1, borderRadius: 20, padding: 18, marginTop: 20 },
  detailHeaderRow: { flexDirection: "row", alignItems: "center" },
  detailIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  detailTitleCopy: { flex: 1, marginLeft: 12, marginRight: 6 },
  detailName: { fontSize: 20, lineHeight: 26, fontWeight: "800" },
  kodeText: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  detailSubRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  statusPill: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 11, fontWeight: "800" },
  detailNote: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, paddingVertical: 12, marginTop: 4 },
  detailLabel: { fontSize: 12 },
  detailValue: { flex: 1, fontSize: 12, fontWeight: "700", textAlign: "right" },
  pickerCard: { borderWidth: 1, borderRadius: 20, padding: 14, marginTop: 16 },
  pickerHeader: { flexDirection: "row", alignItems: "center" },
  pickerCopy: { flex: 1 },
  iconButton: { width: 36, height: 36, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  searchInput: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, fontSize: 13, marginTop: 12 },
  formError: { fontSize: 12, marginTop: 8 },
  optionRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 9 },
  optionIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  optionCopy: { flex: 1, marginLeft: 10 },
  optionLabel: { fontSize: 13, fontWeight: "800" },
  optionSublabel: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, marginTop: 22 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, marginTop: 3 },
  addSmallButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  addSmallText: { fontSize: 12, fontWeight: "800" },
  refreshButton: { width: 36, height: 36, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 9 },
  cardIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  cardCopy: { flex: 1, marginLeft: 11, marginRight: 8 },
  cardTitle: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
  cardMeta: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  moveButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  moveButtonText: { fontSize: 11, fontWeight: "800" },
  historyRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, padding: 11, marginBottom: 8 },
  historyIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  historyCopy: { flex: 1, marginLeft: 10 },
  historyTitle: { fontSize: 13, fontWeight: "800" },
  historyMeta: { fontSize: 11, lineHeight: 15, marginTop: 2 },
});