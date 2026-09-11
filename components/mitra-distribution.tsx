import { MitraProductShipment } from "@/components/mitra-product-shipment";
import { MitraShipmentReceiving } from "@/components/mitra-shipment-receiving";
import { MitraProductCatalog } from "@/components/mitra-product-catalog";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type DistributionView = "supply" | "shipment" | "receiving" | "history" | "products";
type RequestType = "new_item" | "stock_change";
type SupplierRequest = { id: string; requestType: string; itemId: string | null; proposedName: string | null; proposedStockQuantity: number | null; reason: string; status: string; reviewNote: string | null; createdAt: string };

const MENUS: { key: DistributionView; label: string; icon: "send" | "shippingbox" | "inventory" | "verified" }[] = [
  { key: "supply", label: "Ajukan Supply", icon: "send" },
  { key: "products", label: "Katalog Produk", icon: "inventory" },
  { key: "shipment", label: "Pengiriman", icon: "shippingbox" },
  { key: "receiving", label: "Penerimaan", icon: "inventory" },
  { key: "history", label: "Riwayat Distribusi", icon: "verified" },
];

export function MitraDistribution() {
  const colors = useColors();
  const requestsQuery = trpc.supplier.requests.useQuery();
  const stockQuery = trpc.mitraDashboard.stock.useQuery();
  const submitNewItem = trpc.supplier.submitNewItem.useMutation();
  const submitStockChange = trpc.supplier.submitStockChange.useMutation();
  const utils = trpc.useUtils();
  const [view, setView] = useState<DistributionView | null>(null);
  const [requestType, setRequestType] = useState<RequestType | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [proposedStock, setProposedStock] = useState("");
  const [minimumStock, setMinimumStock] = useState("");
  const [itemId, setItemId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stockChangeItems = useMemo(() => stockQuery.data?.stockChangeItems ?? [], [stockQuery.data?.stockChangeItems]);
  useEffect(() => {
    if (!itemId && stockChangeItems[0]) setItemId(stockChangeItems[0].id);
  }, [itemId, stockChangeItems]);

  const resetForm = () => {
    setRequestType(null);
    setName("");
    setSku("");
    setUnit("");
    setProposedStock("");
    setMinimumStock("");
    setItemId("");
    setReason("");
  };
  const selectView = (next: DistributionView | null) => {
    setView(next);
    setError(null);
    setMessage(null);
  };
  const submitRequest = async () => {
    setError(null);
    setMessage(null);
    if (!requestType) return setError("Pilih jenis pengajuan terlebih dahulu.");
    const parsedStock = Number(proposedStock);
    if (!Number.isInteger(parsedStock) || parsedStock < 0) return setError("Stok harus berupa bilangan bulat 0 atau lebih.");
    if (reason.trim().length < 3) return setError("Alasan pengajuan wajib diisi minimal 3 karakter.");
    try {
      if (requestType === "new_item") {
        if (!name.trim() || !unit.trim()) return setError("Nama Produk dan Unit wajib diisi.");
        const parsedMinimum = Number(minimumStock);
        if (!Number.isInteger(parsedMinimum) || parsedMinimum < 0) return setError("Minimum Stock harus berupa bilangan bulat 0 atau lebih.");
        await submitNewItem.mutateAsync({ name: name.trim(), sku: sku.trim() || null, unit: unit.trim(), proposedStockQuantity: parsedStock, proposedMinimumStock: parsedMinimum, reason: reason.trim() });
      } else {
        if (!itemId) return setError("Pilih Consignment Item yang akan diubah.");
        await submitStockChange.mutateAsync({ itemId, proposedStockQuantity: parsedStock, reason: reason.trim() });
      }
      await utils.supplier.requests.invalidate();
      await requestsQuery.refetch();
      resetForm();
      setMessage("Pengajuan Supply berhasil dikirim dan menunggu persetujuan.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Pengajuan belum dapat dikirim.");
    }
  };
  const isSubmitting = submitNewItem.isPending || submitStockChange.isPending;

  return (
    <View style={styles.root}>
      {view === null ? (
        <View style={styles.menuList}>
          {MENUS.map((menu) => (
            <Pressable key={menu.key} accessibilityRole="button" onPress={() => selectView(menu.key)} style={({ pressed }) => [styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
              <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}14` }]}><AppIcon name={menu.icon} size={20} color={colors.primary} /></View>
              <Text style={[styles.menuText, { color: colors.foreground }]}>{menu.label}</Text>
              <AppIcon name="chevron-right" size={18} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {view !== null ? (
        <View style={styles.content}>
          <Pressable accessibilityRole="button" onPress={() => selectView(null)} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
            <AppIcon name="chevron-left" size={16} color={colors.primary} />
            <Text style={[styles.backText, { color: colors.primary }]}>Kembali ke Distribusi</Text>
          </Pressable>
          {view === "products" ? <MitraProductCatalog /> : view === "supply" ? (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.title, { color: colors.foreground }]}>Ajukan Supply</Text>
                  <Text style={[styles.helper, { color: colors.muted }]}>Pilih jenis pengajuan. Identitas Mitra, Distributor, Product Master, dan Consignment Item ditentukan oleh backend persistent.</Text>
                  <Text style={[styles.label, { color: colors.foreground }]}>Jenis Pengajuan</Text>
                  <View style={styles.chips}>
                    <Choice label="New Item" selected={requestType === "new_item"} onPress={() => { setRequestType("new_item"); setError(null); }} colors={colors} />
                    <Choice label="Stock Change" selected={requestType === "stock_change"} onPress={() => { setRequestType("stock_change"); setError(null); }} colors={colors} />
                  </View>
                  {requestType === "new_item" ? <NewItemForm name={name} sku={sku} unit={unit} proposedStock={proposedStock} minimumStock={minimumStock} reason={reason} setName={setName} setSku={setSku} setUnit={setUnit} setProposedStock={setProposedStock} setMinimumStock={setMinimumStock} setReason={setReason} colors={colors} /> : null}
                  {requestType === "stock_change" ? <StockChangeForm items={stockChangeItems} query={stockQuery} itemId={itemId} proposedStock={proposedStock} reason={reason} setItemId={setItemId} setProposedStock={setProposedStock} setReason={setReason} colors={colors} /> : null}
                  {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
                  {requestType ? <Pressable accessibilityRole="button" disabled={isSubmitting || stockQuery.isLoading} onPress={() => void submitRequest()} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && styles.pressed, (isSubmitting || stockQuery.isLoading) && styles.disabled]}><Text style={[styles.buttonText, { color: colors.background }]}>{isSubmitting ? "Mengirim..." : "Ajukan Supply"}</Text></Pressable> : null}
                  {message ? <Text style={[styles.message, { color: colors.success }]}>{message}</Text> : null}
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          ) : view === "shipment" ? <MitraProductShipment onSaved={() => selectView("history")} /> : view === "receiving" ? <MitraShipmentReceiving onSaved={() => selectView("history")} /> : <DistributionHistory query={requestsQuery} stockItems={stockChangeItems} colors={colors} />}
        </View>
      ) : null}
    </View>
  );
}

function NewItemForm({ name, sku, unit, proposedStock, minimumStock, reason, setName, setSku, setUnit, setProposedStock, setMinimumStock, setReason, colors }: { name: string; sku: string; unit: string; proposedStock: string; minimumStock: string; reason: string; setName: (value: string) => void; setSku: (value: string) => void; setUnit: (value: string) => void; setProposedStock: (value: string) => void; setMinimumStock: (value: string) => void; setReason: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  return <>
    <Field label="Nama Produk" value={name} onChange={setName} placeholder="Contoh: Sambal Ijo" colors={colors} />
    <Field label="SKU (opsional)" value={sku} onChange={setSku} placeholder="Contoh: SAM-001" colors={colors} />
    <Field label="Unit" value={unit} onChange={setUnit} placeholder="Contoh: pcs" colors={colors} />
    <Field label="Stok Awal yang Diusulkan" value={proposedStock} onChange={(value) => setProposedStock(value.replace(/[^0-9]/g, ""))} placeholder="Contoh: 100" numeric colors={colors} />
    <Field label="Minimum Stock" value={minimumStock} onChange={(value) => setMinimumStock(value.replace(/[^0-9]/g, ""))} placeholder="Contoh: 10" numeric colors={colors} />
    <Field label="Alasan" value={reason} onChange={setReason} placeholder="Alasan pengajuan (wajib)" multiline colors={colors} />
  </>;
}

function StockChangeForm({ items, query, itemId, proposedStock, reason, setItemId, setProposedStock, setReason, colors }: { items: { id: string; productId: string | null; productName: string | null; name: string; unit: string; stockQuantity: number }[]; query: ReturnType<typeof trpc.mitraDashboard.stock.useQuery>; itemId: string; proposedStock: string; reason: string; setItemId: (value: string) => void; setProposedStock: (value: string) => void; setReason: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  return <>
    <Text style={[styles.label, { color: colors.foreground }]}>Consignment Item</Text>
    {query.isLoading ? <Text style={[styles.state, { color: colors.muted }]}>Memuat Consignment Item...</Text> : null}
    {query.isError ? <Text style={[styles.error, { color: colors.error }]}>Consignment Item belum dapat dimuat.</Text> : null}
    {!query.isLoading && !query.isError && !items.length ? <Text style={[styles.empty, { color: colors.muted }]}>Belum ada Consignment Item dengan Product Master yang valid.</Text> : null}
    <View style={styles.chips}>{items.map((item) => <Choice key={item.id} label={`${item.productName ?? item.name} · stok ${item.stockQuantity} ${item.unit}`} selected={item.id === itemId} onPress={() => setItemId(item.id)} colors={colors} />)}</View>
    <Field label="Stok Setelah Perubahan" value={proposedStock} onChange={(value) => setProposedStock(value.replace(/[^0-9]/g, ""))} placeholder="Contoh: 35 (stok akhir)" numeric colors={colors} />
    <Text style={[styles.helper, { color: colors.muted }]}>Isi jumlah stok akhir, bukan jumlah tambahan atau delta.</Text>
    <Field label="Alasan" value={reason} onChange={setReason} placeholder="Alasan perubahan stok (wajib)" multiline colors={colors} />
  </>;
}

function DistributionHistory({ query, stockItems, colors }: { query: { data?: SupplierRequest[]; isLoading: boolean; isError: boolean }; stockItems: { id: string; productName: string | null; name: string }[]; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.title, { color: colors.foreground }]}>Riwayat Distribusi</Text>
    <Text style={[styles.helper, { color: colors.muted }]}>Riwayat berasal dari Supplier Request persistent.</Text>
    {query.isLoading ? <Text style={[styles.state, { color: colors.muted }]}>Memuat riwayat pengajuan...</Text> : null}
    {query.isError ? <Text style={[styles.error, { color: colors.error }]}>Riwayat pengajuan belum dapat dimuat.</Text> : null}
    {!query.isLoading && !query.isError && !query.data?.length ? <Text style={[styles.empty, { color: colors.muted }]}>Belum ada riwayat pengajuan.</Text> : null}
    {!query.isLoading && !query.isError ? query.data?.map((request) => {
      const item = stockItems.find((candidate) => candidate.id === request.itemId);
      const title = request.requestType === "new_item" ? request.proposedName ?? "New Item" : item?.productName ?? item?.name ?? "Stock Change";
      const quantity = request.proposedStockQuantity ?? 0;
      return <View key={request.id} style={[styles.historyRow, { borderTopColor: colors.border }]}><View style={styles.copy}><Text style={[styles.name, { color: colors.foreground }]}>{title}</Text><Text style={[styles.meta, { color: colors.muted }]}>{request.requestType === "new_item" ? "New Item" : "Stock Change"} · {quantity} unit · {new Date(request.createdAt).toLocaleDateString("id-ID")}</Text><Text style={[styles.meta, { color: colors.muted }]}>Alasan: {request.reason}</Text>{request.reviewNote ? <Text style={[styles.meta, { color: colors.muted }]}>Catatan review: {request.reviewNote}</Text> : null}</View><StatusBadge status={request.status} colors={colors} /></View>;
    }) : null}
  </View>;
}

function Field({ label, value, onChange, placeholder, numeric, multiline, colors }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; numeric?: boolean; multiline?: boolean; colors: ReturnType<typeof useColors> }) {
  return <><Text style={[styles.label, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={numeric ? "number-pad" : "default"} multiline={multiline} style={[styles.input, multiline && styles.notes, { color: colors.foreground, borderColor: colors.border }]} /></>;
}

function Choice({ label, selected, onPress, colors }: { label: string; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}14` : colors.background }, pressed && styles.pressed]}><Text style={[styles.chipText, { color: selected ? colors.primary : colors.muted }]}>{label}</Text></Pressable>;
}

function StatusBadge({ status, colors }: { status: string; colors: ReturnType<typeof useColors> }) {
  const color = status === "approved" ? colors.success : status === "rejected" ? colors.error : colors.warning;
  return <Text style={[styles.status, { color }]}>{status === "approved" ? "Disetujui" : status === "rejected" ? "Ditolak" : "Menunggu Persetujuan"}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { flex: 1 }, menuList: { marginTop: 20, gap: 10 }, menuCard: { minHeight: 64, borderWidth: 1, borderRadius: 17, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 }, menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }, menuText: { flex: 1, fontSize: 14, fontWeight: "800" }, backButton: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16 }, backText: { fontSize: 12, fontWeight: "800" }, card: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 14 }, title: { fontSize: 19, fontWeight: "800" }, helper: { fontSize: 12, lineHeight: 18, marginTop: 5 }, label: { fontSize: 12, fontWeight: "800", marginTop: 16, marginBottom: 7 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8 }, chipText: { fontSize: 11, fontWeight: "700" }, input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, notes: { minHeight: 72, paddingTop: 11, textAlignVertical: "top" }, error: { fontSize: 12, lineHeight: 18, marginTop: 12 }, button: { minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 17 }, buttonText: { fontSize: 14, fontWeight: "800" }, message: { fontSize: 12, fontWeight: "700", marginTop: 11 }, historyRow: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12, marginTop: 7 }, copy: { flex: 1 }, name: { fontSize: 13, fontWeight: "800" }, meta: { fontSize: 10, marginTop: 3 }, status: { fontSize: 10, fontWeight: "800" }, empty: { fontSize: 12, paddingVertical: 18 }, state: { fontSize: 12, lineHeight: 18, marginTop: 8 }, pressed: { opacity: 0.78 }, disabled: { opacity: 0.55 },
});
