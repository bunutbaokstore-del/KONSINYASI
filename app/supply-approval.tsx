import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type SupplierRequest = {
  id: string;
  requestType: "new_item" | "stock_change";
  itemId: string | null;
  proposedName: string | null;
  proposedSku: string | null;
  proposedUnit: string | null;
  proposedStockQuantity: number | null;
  proposedMinimumStock: number | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export default function SupplyApprovalScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const isDistributor = user?.role === "distributor";
  const canRead = isDistributor || user?.role === "admin";
  const requestsQuery = trpc.supplier.requests.useQuery(undefined, { enabled: isAuthenticated && canRead });
  const reviewMutation = trpc.supplier.review.useMutation();
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const requests = (requestsQuery.data ?? []) as SupplierRequest[];
  const pending = requests.filter((request) => request.status === "pending");
  const selected = requests.find((request) => request.id === selectedId);
  const review = async (decision: "approved" | "rejected") => {
    if (!selected || !isDistributor) return;
    setError(null);
    setMessage(null);
    try {
      await reviewMutation.mutateAsync({ requestId: selected.id, decision, reviewNote: reviewNote.trim() || undefined });
      await utils.supplier.requests.invalidate();
      await requestsQuery.refetch();
      setSelectedId(null);
      setReviewNote("");
      setMessage(`Pengajuan berhasil ${decision === "approved" ? "disetujui" : "ditolak"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Persetujuan tidak dapat diproses.");
    }
  };

  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={colors.primary} /></ScreenContainer>;
  if (!isAuthenticated || !canRead) return <ScreenContainer className="items-center justify-center px-6"><Text style={[styles.title, { color: colors.foreground }]}>Akses tidak tersedia</Text><Text style={[styles.helper, { color: colors.muted }]}>Halaman Supplier Request hanya tersedia untuk Distributor atau Admin read-only.</Text></ScreenContainer>;

  return <ScreenContainer className="px-5"><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={() => router.back()} style={[styles.back, { borderColor: colors.border }]}><Text style={[styles.backText, { color: colors.foreground }]}>‹</Text></Pressable><View style={styles.copy}><Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG DISTRIBUTOR</Text><Text style={[styles.title, { color: colors.foreground }]}>Persetujuan Supply</Text><Text style={[styles.helper, { color: colors.muted }]}>{isDistributor ? "Periksa pengajuan Mitra UMKM dan berikan keputusan." : "Admin dapat membaca request, tetapi tidak memiliki kewenangan approval."}</Text></View><View style={[styles.icon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="verified" size={22} color={colors.primary} /></View></View>
    {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
    {message ? <Text style={[styles.message, { color: colors.success }]}>{message}</Text> : null}
    {requestsQuery.isLoading ? <Text style={[styles.state, { color: colors.muted }]}>Memuat pengajuan persistent...</Text> : null}
    {requestsQuery.isError ? <Text style={[styles.error, { color: colors.error }]}>Pengajuan persistent belum dapat dimuat.</Text> : null}
    {!requestsQuery.isLoading && !requestsQuery.isError ? <>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Menunggu Persetujuan ({pending.length})</Text>
      {pending.length ? pending.map((request) => <RequestCard key={request.id} request={request} selected={request.id === selectedId} canApprove={isDistributor} onSelect={() => { setSelectedId(request.id === selectedId ? null : request.id); setReviewNote(""); setError(null); }} reviewNote={reviewNote} setReviewNote={setReviewNote} onReview={review} isPending={reviewMutation.isPending} colors={colors} />) : <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Tidak ada pengajuan pending</Text><Text style={[styles.helper, { color: colors.muted }]}>Pengajuan Supplier Request baru akan tampil di sini.</Text></View>}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Riwayat Keputusan</Text>
      {requests.filter((request) => request.status !== "pending").length ? requests.filter((request) => request.status !== "pending").map((request) => <HistoryRow key={request.id} request={request} colors={colors} />) : <Text style={[styles.emptyText, { color: colors.muted }]}>Belum ada riwayat keputusan.</Text>}
    </> : null}
  </ScrollView></ScreenContainer>;
}

function RequestCard({ request, selected, canApprove, onSelect, reviewNote, setReviewNote, onReview, isPending, colors }: { request: SupplierRequest; selected: boolean; canApprove: boolean; onSelect: () => void; reviewNote: string; setReviewNote: (value: string) => void; onReview: (decision: "approved" | "rejected") => void; isPending: boolean; colors: ReturnType<typeof useColors> }) {
  const isNewItem = request.requestType === "new_item";
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.border }]}>
      <View style={styles.cardTop}>
        <View style={styles.copy}>
          <Text style={[styles.name, { color: colors.foreground }]}>{isNewItem ? request.proposedName ?? "New Item" : "Stock Change"}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>Request ID: {request.id}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>Tipe: {isNewItem ? "New Item" : "Stock Change"} · Dibuat {new Date(request.createdAt).toLocaleDateString("id-ID")}</Text>
        </View>
        <Text style={[styles.status, { color: colors.warning }]}>Menunggu Persetujuan</Text>
      </View>
      {isNewItem ? (
        <>
          <Text style={[styles.meta, { color: colors.muted }]}>SKU: {request.proposedSku ?? "-"} · Unit: {request.proposedUnit ?? "-"}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>Stok awal: {request.proposedStockQuantity ?? 0} · Minimum: {request.proposedMinimumStock ?? 0}</Text>
        </>
      ) : (
        <>
          <Text style={[styles.meta, { color: colors.muted }]}>Consignment Item ID: {request.itemId ?? "-"}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>Stok Setelah Perubahan: {request.proposedStockQuantity ?? 0}</Text>
        </>
      )}
      <Text style={[styles.note, { color: colors.muted }]}>Alasan: {request.reason}</Text>
      {canApprove ? (
        <>
          <Pressable accessibilityRole="button" disabled={isPending} onPress={onSelect} style={({ pressed }) => [styles.selectButton, { borderColor: colors.primary }, pressed && styles.pressed, isPending && styles.disabled]}>
            <Text style={[styles.selectText, { color: colors.primary }]}>{selected ? "Tutup keputusan" : "Periksa pengajuan"}</Text>
          </Pressable>
          {selected ? (
            <View>
              <Text style={[styles.label, { color: colors.foreground }]}>Catatan Review (opsional)</Text>
              <TextInput value={reviewNote} onChangeText={setReviewNote} placeholder="Catatan keputusan" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.notes, { color: colors.foreground, borderColor: colors.border }]} />
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" disabled={isPending} onPress={() => onReview("rejected")} style={({ pressed }) => [styles.action, { borderColor: colors.error }, pressed && styles.pressed, isPending && styles.disabled]}>
                  <Text style={[styles.actionText, { color: colors.error }]}>{isPending ? "Memproses..." : "Tolak"}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={isPending} onPress={() => onReview("approved")} style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, borderColor: colors.primary }, pressed && styles.pressed, isPending && styles.disabled]}>
                  <Text style={[styles.actionText, { color: colors.background }]}>{isPending ? "Memproses..." : "Setujui"}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function HistoryRow({ request, colors }: { request: SupplierRequest; colors: ReturnType<typeof useColors> }) {
  const title = request.requestType === "new_item" ? request.proposedName ?? "New Item" : "Stock Change";
  const typeLabel = request.requestType === "new_item" ? "New Item" : "Stock Change";
  return <View style={[styles.history, { borderTopColor: colors.border }]}><Text style={[styles.name, { color: colors.foreground }]}>{title}</Text><Text style={[styles.meta, { color: colors.muted }]}>{typeLabel} · {request.status} · Request ID: {request.id}</Text><Text style={[styles.meta, { color: colors.muted }]}>{request.requestType === "stock_change" ? `Item ID: ${request.itemId ?? "-"} · Stok Setelah Perubahan: ${request.proposedStockQuantity ?? 0}` : `Stok awal: ${request.proposedStockQuantity ?? 0} · Minimum: ${request.proposedMinimumStock ?? 0}`}</Text>{request.reviewNote ? <Text style={[styles.meta, { color: colors.muted }]}>Catatan review: {request.reviewNote}</Text> : null}<Text style={[styles.meta, { color: colors.muted }]}>Dibuat: {new Date(request.createdAt).toLocaleDateString("id-ID")}{request.reviewedAt ? ` · Ditinjau: ${new Date(request.reviewedAt).toLocaleDateString("id-ID")}` : ""}</Text></View>;
}

const styles = StyleSheet.create({ content: { paddingTop: 14, paddingBottom: 32 }, header: { flexDirection: "row", alignItems: "flex-start" }, back: { width: 36, height: 36, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 10 }, backText: { fontSize: 24, lineHeight: 27 }, copy: { flex: 1 }, eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 6 }, title: { fontSize: 24, fontWeight: "800" }, helper: { fontSize: 12, lineHeight: 18, marginTop: 6 }, icon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", marginLeft: 8 }, error: { fontSize: 12, marginTop: 14 }, message: { fontSize: 12, fontWeight: "700", marginTop: 14 }, state: { fontSize: 12, lineHeight: 18, marginTop: 14 }, sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 22, marginBottom: 9 }, card: { borderWidth: 1, borderRadius: 16, padding: 13, marginBottom: 9 }, cardTop: { flexDirection: "row", alignItems: "flex-start" }, name: { fontSize: 13, fontWeight: "800" }, meta: { fontSize: 10, lineHeight: 15, marginTop: 4 }, status: { fontSize: 10, fontWeight: "800", textAlign: "right", maxWidth: 105 }, note: { fontSize: 11, lineHeight: 17, marginTop: 9 }, selectButton: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, alignSelf: "flex-start", marginTop: 10 }, selectText: { fontSize: 11, fontWeight: "800" }, label: { fontSize: 11, fontWeight: "800", marginTop: 12, marginBottom: 6 }, input: { minHeight: 43, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontSize: 13 }, notes: { minHeight: 66, paddingTop: 10, textAlignVertical: "top" }, actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 13 }, action: { minWidth: 78, minHeight: 40, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" }, actionText: { fontSize: 12, fontWeight: "800" }, empty: { borderWidth: 1, borderRadius: 16, padding: 15 }, emptyTitle: { fontSize: 13, fontWeight: "800" }, emptyText: { fontSize: 12, paddingVertical: 18 }, history: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 }, pressed: { opacity: 0.78 }, disabled: { opacity: 0.55 } });
