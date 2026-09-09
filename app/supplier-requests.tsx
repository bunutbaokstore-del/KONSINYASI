import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const initialNewItem = { name: "", sku: "", unit: "pcs", stock: "0", minimum: "0", reason: "" };

export default function SupplierRequestsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const role = user?.role;
  const isMitra = role === "mitra_umkm";
  const isManager = role === "admin" || role === "distributor";
  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)" as never); };
  const scrollRef = useRef<ScrollView | null>(null);
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const requestsQuery = trpc.supplier.requests.useQuery(undefined, { enabled: isAuthenticated && (isMitra || isManager) });

  if (loading) return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center"><ActivityIndicator size="large" color={colors.primary} /></ScreenContainer>;
  if (!isAuthenticated || (!isMitra && !isManager)) return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center px-6"><Text style={[styles.deniedTitle, { color: colors.foreground }]}>Akses tidak tersedia</Text><Text style={[styles.deniedText, { color: colors.muted }]}>Halaman ini hanya tersedia untuk Mitra UMKM, Admin, dan Distributor.</Text><Pressable onPress={goBack} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Kembali</Text></Pressable></ScreenContainer>;

  if (role === "admin") return <AdminReviewView colors={colors} requestsQuery={requestsQuery} onBack={goBack} requestId={requestId} scrollRef={scrollRef} />;
  return isMitra ? <MitraRequestView colors={colors} requestsQuery={requestsQuery} onBack={goBack} requestId={requestId} scrollRef={scrollRef} /> : <ManagerReviewView colors={colors} requestsQuery={requestsQuery} onBack={goBack} />;
}

type Colors = ReturnType<typeof useColors>;
type SupplierRequest = { id: string; requestType: string; itemId: string | null; mitraUserId: string; proposedName: string | null; proposedSku: string | null; proposedUnit: string | null; proposedStockQuantity: number | null; proposedMinimumStock: number | null; reason: string; status: string; reviewNote: string | null; reviewedAt: string | null; createdAt: string };
type RequestStatusFilter = "all" | "pending" | "approved" | "rejected";
type RequestsQuery = ReturnType<typeof trpc.supplier.requests.useQuery>;

type ViewProps = { colors: Colors; requestsQuery: RequestsQuery; onBack: () => void; requestId?: string; scrollRef: React.RefObject<ScrollView | null> };

function MitraRequestView({ colors, requestsQuery, onBack, requestId, scrollRef }: ViewProps) {
  const [kind, setKind] = useState<"new" | "stock">("new");
  const [form, setForm] = useState(initialNewItem);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequestStatusFilter>("all");
  const [focusedId, setFocusedId] = useState<string | undefined>(requestId);
  useEffect(() => { setFocusedId(requestId); }, [requestId]);
  const [error, setError] = useState<string | null>(null);
  const itemsQuery = trpc.mitraDashboard.stock.useQuery();
  const newItemMutation = trpc.supplier.submitNewItem.useMutation();
  const stockMutation = trpc.supplier.submitStockChange.useMutation();
  const items = itemsQuery.data?.items ?? [];
  const allRequests = (requestsQuery.data ?? []) as SupplierRequest[];
  const statusCounts = { all: allRequests.length, pending: allRequests.filter((request) => request.status === "pending").length, approved: allRequests.filter((request) => request.status === "approved").length, rejected: allRequests.filter((request) => request.status === "rejected").length };
  const visibleRequests = statusFilter === "all" ? allRequests : allRequests.filter((request) => request.status === statusFilter);
  const historyRequests = focusedId ? allRequests.filter((request) => request.id === focusedId) : visibleRequests;
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
  return <RequestShell colors={colors} title="Pengajuan supplier" subtitle="Ajukan barang atau perubahan stok kepada Admin." onBack={onBack} scrollRef={scrollRef}>
    <View style={styles.segment}><Pressable onPress={() => setKind("new")} style={[styles.segmentButton, { backgroundColor: kind === "new" ? colors.primary : colors.background }]}><Text style={[styles.segmentText, { color: kind === "new" ? colors.background : colors.foreground }]}>Barang baru</Text></Pressable><Pressable onPress={() => setKind("stock")} style={[styles.segmentButton, { backgroundColor: kind === "stock" ? colors.primary : colors.background }]}><Text style={[styles.segmentText, { color: kind === "stock" ? colors.background : colors.foreground }]}>Perubahan stok</Text></Pressable></View>
    <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {kind === "stock" ? <><Text style={[styles.label, { color: colors.foreground }]}>Pilih barang</Text><FlatList horizontal data={items} keyExtractor={(item) => item.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList} renderItem={({ item }) => <Pressable onPress={() => { setSelectedItemId(item.id); update("stock", String(item.stockQuantity)); }} style={[styles.chip, { borderColor: selectedItemId === item.id ? colors.primary : colors.border, backgroundColor: selectedItemId === item.id ? `${colors.primary}16` : colors.background }]}><Text style={[styles.chipText, { color: selectedItemId === item.id ? colors.primary : colors.foreground }]}>{item.name}</Text></Pressable>} />{selectedItem ? <Text style={[styles.helperText, { color: colors.primary }]}>Stok saat ini: {selectedItem.stockQuantity} {selectedItem.unit}</Text> : null}</> : <><Field colors={colors} label="Nama barang" value={form.name} onChangeText={(value) => update("name", value)} placeholder="Contoh: Keripik pisang" /><Field colors={colors} label="Kode barang (opsional)" value={form.sku} onChangeText={(value) => update("sku", value)} placeholder="Contoh: KP-001" /><Field colors={colors} label="Satuan" value={form.unit} onChangeText={(value) => update("unit", value)} placeholder="pcs" /></>}
      <Field colors={colors} label={kind === "new" ? "Stok yang diajukan" : "Stok terbaru yang diajukan"} value={form.stock} onChangeText={(value) => update("stock", value.replace(/[^0-9]/g, ""))} placeholder="0" keyboardType="number-pad" />
      {kind === "new" ? <Field colors={colors} label="Batas minimum stok" value={form.minimum} onChangeText={(value) => update("minimum", value.replace(/[^0-9]/g, ""))} placeholder="0" keyboardType="number-pad" /> : null}
      <Field colors={colors} label="Alasan pengajuan" value={form.reason} onChangeText={(value) => update("reason", value)} placeholder="Jelaskan kebutuhan pengajuan" multiline />
      {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
      <Pressable disabled={newItemMutation.isPending || stockMutation.isPending} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed, (newItemMutation.isPending || stockMutation.isPending) && styles.disabled]}>{newItemMutation.isPending || stockMutation.isPending ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryButtonText, { color: colors.background }]}>Kirim pengajuan</Text>}</Pressable>
    </View>
    <View style={styles.statusFilterSection}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Status pengajuan</Text><View style={styles.statusFilterRow}>{([['all', 'Semua'], ['pending', 'Pending'], ['approved', 'Disetujui'], ['rejected', 'Ditolak']] as const).map(([value, label]) => <Pressable key={value} onPress={() => setStatusFilter(value)} style={[styles.statusFilterButton, { borderColor: statusFilter === value ? colors.primary : colors.border, backgroundColor: statusFilter === value ? `${colors.primary}16` : colors.surface }]}><Text style={[styles.statusFilterText, { color: statusFilter === value ? colors.primary : colors.muted }]}>{label} ({statusCounts[value]})</Text></Pressable>)}</View></View>
    {focusedId ? <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke semua pengajuan" onPress={() => setFocusedId(undefined)} style={({ pressed }) => [styles.backToList, pressed && styles.pressed]}><Text style={[styles.backToListText, { color: colors.primary }]}>‹ Semua Pengajuan</Text></Pressable> : null}
    <RequestList colors={colors} requests={historyRequests} loading={requestsQuery.isLoading} onRefresh={() => void requestsQuery.refetch()} showActions={false} scrollRef={scrollRef} highlightRequestId={focusedId} />
  </RequestShell>;
}

function AdminReviewView({ colors, requestsQuery, onBack, requestId, scrollRef }: ViewProps) {
  const adminReviewMutation = trpc.supplier.adminReview.useMutation();
  const [error, setError] = useState<string | null>(null);
  const [pendingAdmin, setPendingAdmin] = useState<{ requestId: string; action: "approve" | "reject"; reviewNote?: string } | null>(null);
  const [focusedId, setFocusedId] = useState<string | undefined>(requestId);
  useEffect(() => { setFocusedId(requestId); }, [requestId]);
  const activeRequests = ((requestsQuery.data ?? []) as SupplierRequest[]).filter((request) => request.status === "pending");
  const displayRequests = focusedId ? ((requestsQuery.data ?? []) as SupplierRequest[]).filter((request) => request.id === focusedId) : activeRequests;
  const decide = (requestId: string, action: "approve" | "reject") => {
    setError(null);
    setPendingAdmin({ requestId, action, reviewNote: "" });
  };
  const executeAdmin = async () => {
    if (!pendingAdmin || adminReviewMutation.isPending) return;
    if (pendingAdmin.action === "reject" && !(pendingAdmin.reviewNote ?? "").trim()) { setError("Alasan penolakan wajib diisi."); return; }
    try {
      await adminReviewMutation.mutateAsync(pendingAdmin);
      setPendingAdmin(null);
      await requestsQuery.refetch();
    } catch (adminError) {
      setError(adminError instanceof Error ? adminError.message : "Pengajuan belum dapat diproses.");
    }
  };
  const confirmationLabel = pendingAdmin?.action === "approve" ? "Setujui" : "Tolak";
  return <RequestShell colors={colors} title="Persetujuan supplier" subtitle="Periksa pengajuan Mitra UMKM, lalu setujui atau tolak." onBack={onBack} scrollRef={scrollRef}>
    {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
    {pendingAdmin ? <View style={[styles.confirmCard, { backgroundColor: colors.surface, borderColor: pendingAdmin.action === "approve" ? `${colors.primary}55` : `${colors.error}55` }]}><Text style={[styles.confirmTitle, { color: colors.foreground }]}>{pendingAdmin.action === "approve" ? "Setujui pengajuan ini?" : "Tolak pengajuan ini?"}</Text><Text style={[styles.confirmText, { color: colors.muted }]}>{pendingAdmin.action === "approve" ? "Keputusan akan dicatat dan data resmi akan diperbarui." : "Pengajuan akan ditolak dan keputusan ini akan dicatat."}</Text><Field colors={colors} label={pendingAdmin.action === "reject" ? "Alasan penolakan *" : "Catatan (opsional)"} value={pendingAdmin.reviewNote ?? ""} onChangeText={(value) => { setPendingAdmin((current) => current ? { ...current, reviewNote: value } : current); setError(null); }} placeholder={pendingAdmin.action === "reject" ? "Jelaskan alasan pengajuan ditolak..." : "Catatan keputusan"} multiline /><View style={styles.confirmActions}><Pressable accessibilityRole="button" accessibilityLabel="Batalkan keputusan" disabled={adminReviewMutation.isPending} onPress={() => { setPendingAdmin(null); setError(null); }} style={({ pressed }) => [styles.reviewButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.reviewText, { color: colors.muted }]}>Batal</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${confirmationLabel} pengajuan`} disabled={adminReviewMutation.isPending} onPress={() => void executeAdmin()} style={({ pressed }) => [styles.reviewButton, { backgroundColor: pendingAdmin.action === "approve" ? colors.primary : colors.error, borderColor: pendingAdmin.action === "approve" ? colors.primary : colors.error }, pressed && styles.pressed, adminReviewMutation.isPending && styles.disabled]}>{adminReviewMutation.isPending ? <ActivityIndicator color={colors.background} size="small" /> : <Text style={[styles.reviewText, { color: colors.background }]}>{confirmationLabel}</Text>}</Pressable></View></View> : null}
    {focusedId ? <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke semua pengajuan" onPress={() => setFocusedId(undefined)} style={({ pressed }) => [styles.backToList, pressed && styles.pressed]}><Text style={[styles.backToListText, { color: colors.primary }]}>‹ Semua Pengajuan</Text></Pressable> : null}
    <RequestList colors={colors} requests={displayRequests} loading={requestsQuery.isLoading} onRefresh={() => void requestsQuery.refetch()} showActions onAdminAction={decide} reviewPending={adminReviewMutation.isPending} emptyMessage="Belum ada pengajuan yang menunggu review Admin." scrollRef={scrollRef} highlightRequestId={focusedId} />
  </RequestShell>;
}

function ManagerReviewView({ colors, requestsQuery, onBack }: Omit<ViewProps, "requestId" | "scrollRef">) {
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const scrollRef = useRef<ScrollView | null>(null);
  const [focusedId, setFocusedId] = useState<string | undefined>(requestId);
  useEffect(() => { setFocusedId(requestId); }, [requestId]);
  const activeRequests = ((requestsQuery.data ?? []) as SupplierRequest[]).filter((request) => request.status === "pending");
  const displayRequests = focusedId ? ((requestsQuery.data ?? []) as SupplierRequest[]).filter((request) => request.id === focusedId) : activeRequests;
  return <RequestShell colors={colors} title="Persetujuan supplier" subtitle="Pantau pengajuan Mitra UMKM. Keputusan akhir dilakukan oleh Administrator." onBack={onBack} scrollRef={scrollRef}>
    {focusedId ? <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke semua pengajuan" onPress={() => setFocusedId(undefined)} style={({ pressed }) => [styles.backToList, pressed && styles.pressed]}><Text style={[styles.backToListText, { color: colors.primary }]}>‹ Semua Pengajuan</Text></Pressable> : null}
    <RequestList colors={colors} requests={displayRequests} loading={requestsQuery.isLoading} onRefresh={() => void requestsQuery.refetch()} showActions={false} emptyMessage="Belum ada pengajuan yang menunggu keputusan Administrator." scrollRef={scrollRef} highlightRequestId={focusedId} />
  </RequestShell>;
}

function RequestShell({ colors, title, subtitle, onBack, children, scrollRef }: { colors: Colors; title: string; subtitle: string; onBack: () => void; children: React.ReactNode; scrollRef?: React.RefObject<ScrollView | null> }) {
  return <ScreenContainer className="px-5"><ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><View style={styles.headerRow}><Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={onBack} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.backText, { color: colors.foreground }]}>‹</Text></Pressable><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>KONSINYASI</Text><Text style={[styles.title, { color: colors.foreground }]}>{title}</Text></View><View style={[styles.headerIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={20} color={colors.primary} /></View></View><Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>{children}</ScrollView></ScreenContainer>;
}

function RequestList({ colors, requests, loading, onRefresh, showActions, onAdminAction, reviewPending = false, emptyMessage = "Belum ada pengajuan", scrollRef, highlightRequestId }: { colors: Colors; requests: readonly SupplierRequest[]; loading: boolean; onRefresh: () => void; showActions: boolean; onAdminAction?: (requestId: string, action: "approve" | "reject") => void; reviewPending?: boolean; emptyMessage?: string; scrollRef?: React.RefObject<ScrollView | null>; highlightRequestId?: string }) {
  const listYRef = useRef(0);
  const targetYRef = useRef<number | null>(null);
  const scrolledRef = useRef(false);
  const highlighted = highlightRequestId && requests.some((request) => request.id === highlightRequestId) ? highlightRequestId : undefined;
  const targetScroll = () => {
    if (scrolledRef.current || !highlighted || targetYRef.current === null) return;
    scrolledRef.current = true;
    const y = Math.max(listYRef.current + targetYRef.current - 72, 0);
    scrollRef?.current?.scrollTo({ y, animated: true });
  };
  if (loading) return <View style={styles.loadingBlock}><ActivityIndicator color={colors.primary} /></View>;
  return <View style={styles.requestList} onLayout={(event) => { listYRef.current = event.nativeEvent.layout.y; targetScroll(); }}><View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Riwayat pengajuan</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{requests.length} pengajuan</Text></View><Pressable accessibilityRole="button" onPress={onRefresh} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={18} color={colors.primary} /></Pressable></View>{requests.length ? requests.map((request) => <View key={request.id} style={[styles.requestCard, { backgroundColor: request.id === highlighted ? `${colors.primary}12` : colors.surface, borderColor: request.id === highlighted ? colors.primary : colors.border }]} onLayout={request.id === highlighted ? (event) => { targetYRef.current = event.nativeEvent.layout.y; targetScroll(); } : undefined}><View style={styles.requestTop}><Text style={[styles.requestType, { color: colors.foreground }]}>{request.requestType === "new_item" ? "Barang baru" : "Perubahan stok"}</Text><Text style={[styles.requestStatus, { color: request.status === "approved" ? colors.success : request.status === "rejected" ? colors.error : colors.warning }]}>{request.status === "approved" ? "Disetujui" : request.status === "rejected" ? "Ditolak" : "Menunggu"}</Text></View><Text style={[styles.requestName, { color: colors.foreground }]}>{request.proposedName ?? (request.itemId ? "Perubahan stok barang" : "Pengajuan barang")}</Text><Text style={[styles.requestDetail, { color: colors.muted }]}>{request.proposedStockQuantity !== null ? `Stok diajukan: ${request.proposedStockQuantity}` : "Data stok belum diisi"}{request.proposedUnit ? ` ${request.proposedUnit}` : ""}</Text><Text style={[styles.requestReason, { color: colors.muted }]}>{request.reason}</Text>{request.proposedSku && request.requestType === "new_item" ? <Text style={[styles.requestDetail, { color: colors.muted }]}>SKU: {request.proposedSku}</Text> : null}{request.proposedMinimumStock !== null ? <Text style={[styles.requestDetail, { color: colors.muted }]}>Batas minimum: {request.proposedMinimumStock} unit</Text> : null}{request.reviewNote ? <Text style={[styles.requestNote, { color: colors.muted }]}>Catatan Admin: {request.reviewNote}</Text> : null}{showActions && request.status === "pending" ? <View style={styles.reviewActions}><Pressable disabled={reviewPending} onPress={() => onAdminAction?.(request.id, "reject")} style={({ pressed }) => [styles.reviewButton, { borderColor: `${colors.error}55` }, pressed && styles.pressed]}><Text style={[styles.reviewText, { color: colors.error }]}>Tolak</Text></Pressable><Pressable disabled={reviewPending} onPress={() => onAdminAction?.(request.id, "approve")} style={({ pressed }) => [styles.reviewButton, { backgroundColor: colors.primary, borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.reviewText, { color: colors.background }]}>Setujui</Text></Pressable></View> : null}</View>) : <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{emptyMessage}</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Pengajuan barang atau perubahan stok akan tampil di sini.</Text></View>}</View>;
}

function Field({ colors, label, value, onChangeText, placeholder, keyboardType, multiline = false }: { colors: Colors; label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "number-pad"; multiline?: boolean }) { return <View><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={[styles.input, multiline && styles.multilineInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /></View>; }

const styles = StyleSheet.create({
    scroll: { flex: 1 }, content: { paddingBottom: 30 },
 headerRow: { flexDirection: "row", alignItems: "center", paddingTop: 12 }, backButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" }, backText: { fontSize: 29, lineHeight: 32, marginTop: -2 }, headerCopy: { flex: 1, marginLeft: 12 }, headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }, eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 }, title: { fontSize: 23, lineHeight: 29, fontWeight: "800", marginTop: 2 }, subtitle: { fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 16 }, segment: { flexDirection: "row", borderRadius: 12, padding: 3, borderWidth: 1, borderColor: "#D7E2DB", marginBottom: 12 }, segmentButton: { flex: 1, alignItems: "center", borderRadius: 9, paddingVertical: 10 }, segmentText: { fontSize: 12, fontWeight: "800" }, formCard: { borderWidth: 1, borderRadius: 20, padding: 16 }, label: { fontSize: 12, fontWeight: "800", marginTop: 14, marginBottom: 6 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 }, multilineInput: { minHeight: 80, paddingTop: 12 }, chipList: { gap: 8, paddingVertical: 2 }, chip: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9 }, chipText: { fontSize: 12, fontWeight: "800" }, helperText: { fontSize: 11, fontWeight: "700", marginTop: 6 }, errorText: { fontSize: 12, lineHeight: 18, marginTop: 10 }, primaryButton: { minHeight: 49, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 16 }, primaryButtonText: { fontSize: 14, fontWeight: "800" },   statusFilterSection: { marginTop: 20 }, statusFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 9 }, statusFilterButton: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 }, statusFilterText: { fontSize: 11, fontWeight: "800" }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 10 },
 sectionTitle: { fontSize: 18, fontWeight: "800" }, sectionSubtitle: { fontSize: 11, marginTop: 3 }, refreshButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" }, requestList: { marginBottom: 20 }, requestCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 10 }, requestTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, requestType: { fontSize: 12, fontWeight: "800" }, requestStatus: { fontSize: 11, fontWeight: "800" }, requestName: { fontSize: 15, fontWeight: "800", marginTop: 11 }, requestDetail: { fontSize: 11, marginTop: 5 }, requestReason: { fontSize: 11, lineHeight: 17, marginTop: 7 }, requestNote: { fontSize: 11, lineHeight: 17, marginTop: 7, fontStyle: "italic" },   reviewActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 13 }, confirmCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 6 }, confirmTitle: { fontSize: 14, fontWeight: "800" }, confirmText: { fontSize: 11, lineHeight: 17, marginTop: 5 }, confirmActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 13 }, reviewButton: { minWidth: 70, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center" },
 reviewText: { fontSize: 11, fontWeight: "800" }, emptyCard: { borderWidth: 1, borderRadius: 17, alignItems: "center", padding: 22, marginTop: 3 }, emptyTitle: { fontSize: 14, fontWeight: "800" }, emptyText: { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 5 }, loadingBlock: { paddingVertical: 30, alignItems: "center" }, backToList: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: 14, marginBottom: 2 }, backToListText: { fontSize: 13, fontWeight: "800" }, deniedTitle: { fontSize: 19, fontWeight: "800" }, deniedText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 }, secondaryButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16 }, secondaryButtonText: { fontSize: 13, fontWeight: "800" }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] }, disabled: { opacity: 0.55 },
});
