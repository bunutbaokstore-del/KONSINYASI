import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const initialNewItem = { name: "", sku: "", unit: "pcs", stock: "0", minimum: "0", reason: "" };

export default function SupplierRequestsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const role = user?.role;
  const isMitra = role === "mitra_umkm";
  const isManager = role === "admin" || role === "distributor";
  const requestsQuery = trpc.supplier.requests.useQuery(undefined, { enabled: isAuthenticated && (isMitra || isManager) });

  if (loading) return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center"><ActivityIndicator size="large" color={colors.primary} /></ScreenContainer>;
  if (!isAuthenticated || (!isMitra && !isManager)) return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center px-6"><Text style={[styles.deniedTitle, { color: colors.foreground }]}>Akses tidak tersedia</Text><Text style={[styles.deniedText, { color: colors.muted }]}>Halaman ini hanya tersedia untuk Mitra UMKM, Admin, dan Distributor.</Text><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Kembali</Text></Pressable></ScreenContainer>;

  return isMitra ? <MitraRequestView colors={colors} requestsQuery={requestsQuery} onBack={() => router.back()} /> : <ManagerReviewView colors={colors} requestsQuery={requestsQuery} onBack={() => router.back()} />;
}

type Colors = ReturnType<typeof useColors>;
type SupplierRequest = { id: string; requestType: string; itemId: string | null; mitraUserId: string; proposedName: string | null; proposedSku: string | null; proposedUnit: string | null; proposedStockQuantity: number | null; proposedMinimumStock: number | null; reason: string; status: string; reviewNote: string | null; reviewedAt: string | null; createdAt: string };
type RequestsQuery = ReturnType<typeof trpc.supplier.requests.useQuery>;

type ViewProps = { colors: Colors; requestsQuery: RequestsQuery; onBack: () => void };

function MitraRequestView({ colors, requestsQuery, onBack }: ViewProps) {
  const [kind, setKind] = useState<"new" | "stock">("new");
  const [form, setForm] = useState(initialNewItem);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const itemsQuery = trpc.mitraDashboard.stock.useQuery();
  const newItemMutation = trpc.supplier.submitNewItem.useMutation();
  const stockMutation = trpc.supplier.submitStockChange.useMutation();
  const items = itemsQuery.data?.items ?? [];
  const update = (field: keyof typeof initialNewItem, value: string) => { setForm((current) => ({ ...current, [field]: value })); setError(null); };
  const submit = async () => {
    setError(null);
    try {
      if (kind === "new") {
        if (!form.name.trim()) return setError("Nama barang wajib diisi.");
        if (!form.reason.trim()) return setError("Alasan pengajuan wajib diisi.");
        await newItemMutation.mutateAsync({ name: form.name.trim(), sku: form.sku.trim() || null, unit: form.unit.trim() || "pcs", proposedStockQuantity: Number(form.stock), proposedMinimumStock: Number(form.minimum), reason: form.reason.trim() });
      } else {
        if (!selectedItemId) return setError("Pilih barang yang stoknya akan diajukan.");
        if (!form.reason.trim()) return setError("Alasan pengajuan wajib diisi.");
        await stockMutation.mutateAsync({ itemId: selectedItemId, proposedStockQuantity: Number(form.stock), reason: form.reason.trim() });
      }
      setForm(initialNewItem); setSelectedItemId(""); await requestsQuery.refetch();
      Alert.alert("Pengajuan terkirim", "Admin akan memeriksa pengajuan Anda sebelum data resmi diperbarui.");
    } catch (submissionError) { setError(submissionError instanceof Error ? submissionError.message : "Pengajuan belum dapat dikirim."); }
  };
  const selectedItem = items.find((item) => item.id === selectedItemId);
  return <RequestShell colors={colors} title="Pengajuan supplier" subtitle="Ajukan barang atau perubahan stok kepada Admin." onBack={onBack}>
    <View style={styles.segment}><Pressable onPress={() => setKind("new")} style={[styles.segmentButton, { backgroundColor: kind === "new" ? colors.primary : colors.background }]}><Text style={[styles.segmentText, { color: kind === "new" ? colors.background : colors.foreground }]}>Barang baru</Text></Pressable><Pressable onPress={() => setKind("stock")} style={[styles.segmentButton, { backgroundColor: kind === "stock" ? colors.primary : colors.background }]}><Text style={[styles.segmentText, { color: kind === "stock" ? colors.background : colors.foreground }]}>Perubahan stok</Text></Pressable></View>
    <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {kind === "stock" ? <><Text style={[styles.label, { color: colors.foreground }]}>Pilih barang</Text><FlatList horizontal data={items} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList} renderItem={({ item }) => <Pressable onPress={() => { setSelectedItemId(item.id); update("stock", String(item.stockQuantity)); }} style={[styles.chip, { borderColor: selectedItemId === item.id ? colors.primary : colors.border, backgroundColor: selectedItemId === item.id ? `${colors.primary}16` : colors.background }]}><Text style={[styles.chipText, { color: selectedItemId === item.id ? colors.primary : colors.foreground }]}>{item.name}</Text></Pressable>} />{selectedItem ? <Text style={[styles.helperText, { color: colors.primary }]}>Stok saat ini: {selectedItem.stockQuantity} {selectedItem.unit}</Text> : null}</> : <><Field colors={colors} label="Nama barang" value={form.name} onChangeText={(value) => update("name", value)} placeholder="Contoh: Keripik pisang" /><Field colors={colors} label="Kode barang (opsional)" value={form.sku} onChangeText={(value) => update("sku", value)} placeholder="Contoh: KP-001" /><Field colors={colors} label="Satuan" value={form.unit} onChangeText={(value) => update("unit", value)} placeholder="pcs" /></>}
      <Field colors={colors} label={kind === "new" ? "Stok yang diajukan" : "Stok terbaru yang diajukan"} value={form.stock} onChangeText={(value) => update("stock", value.replace(/[^0-9]/g, ""))} placeholder="0" keyboardType="number-pad" />
      {kind === "new" ? <Field colors={colors} label="Batas minimum stok" value={form.minimum} onChangeText={(value) => update("minimum", value.replace(/[^0-9]/g, ""))} placeholder="0" keyboardType="number-pad" /> : null}
      <Field colors={colors} label="Alasan pengajuan" value={form.reason} onChangeText={(value) => update("reason", value)} placeholder="Jelaskan kebutuhan pengajuan" multiline />
      {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
      <Pressable disabled={newItemMutation.isPending || stockMutation.isPending} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed, (newItemMutation.isPending || stockMutation.isPending) && styles.disabled]}>{newItemMutation.isPending || stockMutation.isPending ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryButtonText, { color: colors.background }]}>Kirim pengajuan</Text>}</Pressable>
    </View>
    <RequestList colors={colors} requests={(requestsQuery.data ?? []) as SupplierRequest[]} loading={requestsQuery.isLoading} onRefresh={() => void requestsQuery.refetch()} showActions={false} />
  </RequestShell>;
}

function ManagerReviewView({ colors, requestsQuery, onBack }: ViewProps) {
  const reviewMutation = trpc.supplier.review.useMutation();
  const [error, setError] = useState<string | null>(null);
  const review = (requestId: string, decision: "approved" | "rejected") => Alert.alert(decision === "approved" ? "Setujui pengajuan?" : "Tolak pengajuan?", "Keputusan ini akan dicatat pada riwayat pengajuan.", [{ text: "Batal", style: "cancel" }, { text: decision === "approved" ? "Setujui" : "Tolak", style: decision === "rejected" ? "destructive" : "default", onPress: async () => { try { await reviewMutation.mutateAsync({ requestId, decision }); await requestsQuery.refetch(); } catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : "Pengajuan belum dapat diproses."); } } }]);
  return <RequestShell colors={colors} title="Persetujuan supplier" subtitle="Periksa pengajuan Mitra UMKM sebelum menjadi data resmi." onBack={onBack}>
    {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
    <RequestList colors={colors} requests={(requestsQuery.data ?? []) as SupplierRequest[]} loading={requestsQuery.isLoading} onRefresh={() => void requestsQuery.refetch()} showActions onReview={review} reviewPending={reviewMutation.isPending} />
  </RequestShell>;
}

function RequestShell({ colors, title, subtitle, onBack, children }: { colors: Colors; title: string; subtitle: string; onBack: () => void; children: React.ReactNode }) {
  return <ScreenContainer className="px-5"><FlatList data={[{ key: "content" }]} keyExtractor={(item) => item.key} showsVerticalScrollIndicator={false} renderItem={() => <View style={styles.content}><View style={styles.headerRow}><Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={onBack} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.backText, { color: colors.foreground }]}>‹</Text></Pressable><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>KONSINYASI</Text><Text style={[styles.title, { color: colors.foreground }]}>{title}</Text></View><View style={[styles.headerIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={20} color={colors.primary} /></View></View><Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>{children}</View>} /></ScreenContainer>;
}

function RequestList({ colors, requests, loading, onRefresh, showActions, onReview, reviewPending = false }: { colors: Colors; requests: readonly SupplierRequest[]; loading: boolean; onRefresh: () => void; showActions: boolean; onReview?: (requestId: string, decision: "approved" | "rejected") => void; reviewPending?: boolean }) {
  if (loading) return <View style={styles.loadingBlock}><ActivityIndicator color={colors.primary} /></View>;
  return <View style={styles.requestList}><View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Riwayat pengajuan</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{requests.length} pengajuan</Text></View><Pressable accessibilityRole="button" onPress={onRefresh} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={18} color={colors.primary} /></Pressable></View>{requests.length ? requests.map((request) => <View key={request.id} style={[styles.requestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.requestTop}><Text style={[styles.requestType, { color: colors.foreground }]}>{request.requestType === "new_item" ? "Barang baru" : "Perubahan stok"}</Text><Text style={[styles.requestStatus, { color: request.status === "approved" ? colors.success : request.status === "rejected" ? colors.error : colors.warning }]}>{request.status === "approved" ? "Disetujui" : request.status === "rejected" ? "Ditolak" : "Menunggu"}</Text></View><Text style={[styles.requestName, { color: colors.foreground }]}>{request.proposedName ?? (request.itemId ? "Perubahan stok barang" : "Pengajuan barang")}</Text><Text style={[styles.requestDetail, { color: colors.muted }]}>{request.proposedStockQuantity !== null ? `Stok diajukan: ${request.proposedStockQuantity}` : "Data stok belum diisi"}{request.proposedUnit ? ` ${request.proposedUnit}` : ""}</Text><Text style={[styles.requestReason, { color: colors.muted }]}>{request.reason}</Text>{request.reviewNote ? <Text style={[styles.requestNote, { color: colors.muted }]}>Catatan Admin: {request.reviewNote}</Text> : null}{showActions && request.status === "pending" ? <View style={styles.reviewActions}><Pressable disabled={reviewPending} onPress={() => onReview?.(request.id, "rejected")} style={({ pressed }) => [styles.reviewButton, { borderColor: `${colors.error}55` }, pressed && styles.pressed]}><Text style={[styles.reviewText, { color: colors.error }]}>Tolak</Text></Pressable><Pressable disabled={reviewPending} onPress={() => onReview?.(request.id, "approved")} style={({ pressed }) => [styles.reviewButton, { backgroundColor: colors.primary, borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.reviewText, { color: colors.background }]}>Setujui</Text></Pressable></View> : null}</View>) : <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Belum ada pengajuan</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Pengajuan barang atau perubahan stok akan tampil di sini.</Text></View>}</View>;
}

function Field({ colors, label, value, onChangeText, placeholder, keyboardType, multiline = false }: { colors: Colors; label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "number-pad"; multiline?: boolean }) { return <View><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={[styles.input, multiline && styles.multilineInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /></View>; }

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, headerRow: { flexDirection: "row", alignItems: "center", paddingTop: 12 }, backButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" }, backText: { fontSize: 29, lineHeight: 32, marginTop: -2 }, headerCopy: { flex: 1, marginLeft: 12 }, headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }, eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 }, title: { fontSize: 23, lineHeight: 29, fontWeight: "800", marginTop: 2 }, subtitle: { fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 16 }, segment: { flexDirection: "row", borderRadius: 12, padding: 3, borderWidth: 1, borderColor: "#D7E2DB", marginBottom: 12 }, segmentButton: { flex: 1, alignItems: "center", borderRadius: 9, paddingVertical: 10 }, segmentText: { fontSize: 12, fontWeight: "800" }, formCard: { borderWidth: 1, borderRadius: 20, padding: 16 }, label: { fontSize: 12, fontWeight: "800", marginTop: 14, marginBottom: 6 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 }, multilineInput: { minHeight: 80, paddingTop: 12 }, chipList: { gap: 8, paddingVertical: 2 }, chip: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9 }, chipText: { fontSize: 12, fontWeight: "800" }, helperText: { fontSize: 11, fontWeight: "700", marginTop: 6 }, errorText: { fontSize: 12, lineHeight: 18, marginTop: 10 }, primaryButton: { minHeight: 49, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 16 }, primaryButtonText: { fontSize: 14, fontWeight: "800" }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 10 }, sectionTitle: { fontSize: 18, fontWeight: "800" }, sectionSubtitle: { fontSize: 11, marginTop: 3 }, refreshButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" }, requestList: { marginBottom: 20 }, requestCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 10 }, requestTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, requestType: { fontSize: 12, fontWeight: "800" }, requestStatus: { fontSize: 11, fontWeight: "800" }, requestName: { fontSize: 15, fontWeight: "800", marginTop: 11 }, requestDetail: { fontSize: 11, marginTop: 5 }, requestReason: { fontSize: 11, lineHeight: 17, marginTop: 7 }, requestNote: { fontSize: 11, lineHeight: 17, marginTop: 7, fontStyle: "italic" }, reviewActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 13 }, reviewButton: { minWidth: 70, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center" }, reviewText: { fontSize: 11, fontWeight: "800" }, emptyCard: { borderWidth: 1, borderRadius: 17, alignItems: "center", padding: 22, marginTop: 3 }, emptyTitle: { fontSize: 14, fontWeight: "800" }, emptyText: { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 5 }, loadingBlock: { paddingVertical: 30, alignItems: "center" }, deniedTitle: { fontSize: 19, fontWeight: "800" }, deniedText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 }, secondaryButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16 }, secondaryButtonText: { fontSize: 13, fontWeight: "800" }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] }, disabled: { opacity: 0.55 },
});
