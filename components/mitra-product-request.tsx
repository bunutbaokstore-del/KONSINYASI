import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { REQUEST_STATUS_LABELS, toProductRequestPayload, validateProductRequest, type ProductRequestForm } from "@/lib/mitra-product-request";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type ProductView = "mine" | "requests" | "form";
type RouterOutputs = inferRouterOutputs<AppRouter>;
type Product = RouterOutputs["products"]["list"][number];
type SupplierRequest = RouterOutputs["supplier"]["requests"][number];
type QueryState<T> = { data?: T; isLoading: boolean; error: { message: string } | null; refetch: () => Promise<unknown> };

type FormState = ProductRequestForm;

const EMPTY_FORM: FormState = {
  name: "",
  sku: "",
  unit: "pcs",
  proposedStockQuantity: "",
  proposedMinimumStock: "",
  reason: "",
};


export function MitraProductRequest() {
  const colors = useColors();
  const [view, setView] = useState<ProductView>("mine");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const productsQuery = trpc.products.list.useQuery(undefined);
  const requestsQuery = trpc.supplier.requests.useQuery(undefined);
  const submitMutation = trpc.supplier.submitNewItem.useMutation();
  const utils = trpc.useUtils();

  const selectView = (nextView: ProductView) => {
    setView(nextView);
    setFormError(null);
    setSuccessMessage(null);
  };

  const updateForm = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
    setSuccessMessage(null);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const submitRequest = async () => {
        const validationError = validateProductRequest(form);
    if (validationError) return setFormError(validationError);
    try {
      await submitMutation.mutateAsync(toProductRequestPayload(form));
      await utils.supplier.requests.invalidate();
      resetForm();
      setSuccessMessage("Pengajuan berhasil dikirim dan menunggu persetujuan Distributor.");
      setView("requests");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Pengajuan belum dapat dikirim.");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.subnav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SubnavButton label="Produk Saya" icon="inventory" selected={view === "mine"} onPress={() => selectView("mine")} colors={colors} />
        <SubnavButton label="Pengajuan Produk" icon="send" selected={view === "requests"} onPress={() => selectView("requests")} colors={colors} />
      </View>
      {view === "mine" ? <ProductList query={productsQuery} colors={colors} /> : view === "requests" ? <RequestList query={requestsQuery} colors={colors} successMessage={successMessage} onAdd={() => selectView("form")} /> : <RequestForm form={form} formError={formError} isSubmitting={submitMutation.isPending} colors={colors} onChange={updateForm} onSubmit={() => void submitRequest()} onCancel={() => selectView("requests")} />}
    </View>
  );
}

function SubnavButton({ label, icon, selected, onPress, colors }: { label: string; icon: "inventory" | "send"; selected: boolean; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.subnavButton, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}14` : colors.background }, pressed && styles.pressed]}><AppIcon name={icon} size={17} color={selected ? colors.primary : colors.muted} /><Text style={[styles.subnavText, { color: selected ? colors.primary : colors.muted }]}>{label}</Text></Pressable>;
}

function ProductList({ query, colors }: { query: QueryState<Product[]>; colors: ReturnType<typeof useColors> }) {
  const products = query.data ?? [];
  return <View style={styles.panel}><View style={styles.panelHeader}><View><Text style={[styles.panelTitle, { color: colors.foreground }]}>Produk Saya</Text><Text style={[styles.panelHelper, { color: colors.muted }]}>Product Master yang benar-benar ditugaskan kepada Anda.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Muat ulang Produk Saya" onPress={() => void query.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={17} color={colors.primary} /></Pressable></View>{query.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : query.error ? <ErrorState message={query.error.message} onRetry={() => void query.refetch()} colors={colors} /> : products.length ? <FlatList data={products} keyExtractor={(item) => item.id} scrollEnabled={false} renderItem={({ item }) => <View style={[styles.productRow, { borderTopColor: colors.border }]}><View style={[styles.productIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={20} color={colors.primary} /></View><View style={styles.rowCopy}><Text style={[styles.productName, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.meta, { color: colors.muted }]}>{item.sku ?? "SKU tidak tersedia"} · {item.unit}</Text></View><Text style={[styles.status, { color: item.lifecycleStatus === "active" ? colors.success : colors.muted }]}>{item.lifecycleStatus === "active" ? "Aktif" : "Nonaktif"}</Text></View>} /> : <EmptyState message="Belum ada produk" colors={colors} />}</View>;
}

function RequestList({ query, colors, successMessage, onAdd }: { query: QueryState<SupplierRequest[]>; colors: ReturnType<typeof useColors>; successMessage: string | null; onAdd: () => void }) {
  const requests = query.data ?? [];
  return <View style={styles.panel}><View style={styles.panelHeader}><View style={styles.rowCopy}><Text style={[styles.panelTitle, { color: colors.foreground }]}>Pengajuan Produk</Text><Text style={[styles.panelHelper, { color: colors.muted }]}>Riwayat pengajuan milik Anda dalam workspace ini.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Muat ulang pengajuan produk" onPress={() => void query.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={17} color={colors.primary} /></Pressable></View><Pressable accessibilityRole="button" onPress={onAdd} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><AppIcon name="add" size={18} color={colors.background} /><Text style={[styles.addButtonText, { color: colors.background }]}>Tambah Pengajuan</Text></Pressable>{successMessage ? <Text style={[styles.successText, { color: colors.success }]}>{successMessage}</Text> : null}{query.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : query.error ? <ErrorState message={query.error.message} onRetry={() => void query.refetch()} colors={colors} /> : requests.length ? <FlatList data={requests} keyExtractor={(item) => item.id} scrollEnabled={false} renderItem={({ item }) => <View style={[styles.requestRow, { borderTopColor: colors.border }]}><View style={styles.rowCopy}><Text style={[styles.productName, { color: colors.foreground }]}>{item.proposedName ?? "Pengajuan Produk"}</Text><Text style={[styles.meta, { color: colors.muted }]}>{item.proposedSku ?? "SKU tidak tersedia"} · {item.proposedUnit ?? "Unit tidak tersedia"}</Text><Text style={[styles.meta, { color: colors.muted }]}>{new Date(item.createdAt).toLocaleDateString("id-ID")}</Text>{item.status === "rejected" && item.reviewNote ? <Text style={[styles.reviewNote, { color: colors.error }]}>Catatan reviewer: {item.reviewNote}</Text> : null}</View><Text style={[styles.requestStatus, { color: item.status === "approved" ? colors.success : item.status === "rejected" ? colors.error : colors.warning }]}>{REQUEST_STATUS_LABELS[item.status as keyof typeof REQUEST_STATUS_LABELS] ?? item.status}</Text></View>} /> : <EmptyState message="Belum ada pengajuan produk" colors={colors} />}</View>;
}

function RequestForm({ form, formError, isSubmitting, colors, onChange, onSubmit, onCancel }: { form: FormState; formError: string | null; isSubmitting: boolean; colors: ReturnType<typeof useColors>; onChange: (field: keyof FormState, value: string) => void; onSubmit: () => void; onCancel: () => void }) {
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.formHeader}><View style={styles.rowCopy}><Text style={[styles.panelTitle, { color: colors.foreground }]}>Tambah Pengajuan Produk</Text><Text style={[styles.panelHelper, { color: colors.muted }]}>Pengajuan akan menunggu persetujuan Distributor.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Tutup form pengajuan" onPress={onCancel} style={({ pressed }) => [styles.closeButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="close" size={18} color={colors.foreground} /></Pressable></View><Field label="Nama Produk" value={form.name} onChangeText={(value) => onChange("name", value)} placeholder="Contoh: Sambal Ijo" colors={colors} /><Field label="SKU (opsional)" value={form.sku} onChangeText={(value) => onChange("sku", value)} placeholder="Contoh: SBL-001" colors={colors} /><Field label="Unit" value={form.unit} onChangeText={(value) => onChange("unit", value)} placeholder="pcs" colors={colors} /><Field label="Stok Awal" value={form.proposedStockQuantity} onChangeText={(value) => onChange("proposedStockQuantity", value.replace(/[^0-9]/g, ""))} placeholder="0" keyboardType="number-pad" colors={colors} /><Field label="Minimum Stok" value={form.proposedMinimumStock} onChangeText={(value) => onChange("proposedMinimumStock", value.replace(/[^0-9]/g, ""))} placeholder="0" keyboardType="number-pad" colors={colors} /><Field label="Catatan / Alasan Pengajuan" value={form.reason} onChangeText={(value) => onChange("reason", value)} placeholder="Jelaskan alasan pengajuan produk" multiline colors={colors} />{formError ? <Text style={[styles.errorText, { color: colors.error }]}>{formError}</Text> : null}<Pressable accessibilityRole="button" onPress={onSubmit} disabled={isSubmitting} style={({ pressed }) => [styles.submitButton, { backgroundColor: colors.primary }, pressed && styles.pressed, isSubmitting && styles.disabled]}>{isSubmitting ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.addButtonText, { color: colors.background }]}>Kirim Pengajuan</Text>}</Pressable></View>;
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, colors }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "number-pad"; multiline?: boolean; colors: ReturnType<typeof useColors> }) {
  return <View><Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} multiline={multiline} returnKeyType={multiline ? "default" : "next"} style={[styles.input, multiline && styles.multiline, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /></View>;
}

function EmptyState({ message, colors }: { message: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.stateCard, { backgroundColor: colors.background, borderColor: colors.border }]}><AppIcon name="inventory" size={27} color={colors.muted} /><Text style={[styles.stateTitle, { color: colors.foreground }]}>{message}</Text></View>;
}

function ErrorState({ message, onRetry, colors }: { message: string; onRetry: () => void; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.stateCard, { backgroundColor: colors.background, borderColor: colors.border }]}><AppIcon name="inventory" size={27} color={colors.error} /><Text style={[styles.stateTitle, { color: colors.foreground }]}>Data belum dapat dimuat</Text><Text style={[styles.stateText, { color: colors.muted }]}>{message}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.retryText, { color: colors.primary }]}>Coba lagi</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  root: { marginTop: 14 },
  subnav: { borderWidth: 1, borderRadius: 15, padding: 5, flexDirection: "row", gap: 6 },
  subnavButton: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 8 },
  subnavText: { fontSize: 11, fontWeight: "800" },
  panel: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 12 },
  panelHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  panelTitle: { fontSize: 18, fontWeight: "800" },
  panelHelper: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  rowCopy: { flex: 1 },
  refreshButton: { width: 37, height: 37, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  addButton: { minHeight: 46, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16 },
  addButtonText: { fontSize: 13, fontWeight: "800" },
  successText: { fontSize: 12, lineHeight: 18, marginTop: 11 },
  center: { minHeight: 150, alignItems: "center", justifyContent: "center" },
  productRow: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12, marginTop: 8, gap: 10 },
  productIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
  meta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  status: { fontSize: 10, fontWeight: "800" },
  requestRow: { flexDirection: "row", alignItems: "flex-start", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12, marginTop: 8, gap: 10 },
  requestStatus: { fontSize: 10, fontWeight: "800", maxWidth: 92, textAlign: "right" },
  reviewNote: { fontSize: 11, lineHeight: 16, marginTop: 7 },
  stateCard: { borderWidth: 1, borderRadius: 15, padding: 18, alignItems: "center", justifyContent: "center", marginTop: 12 },
  stateTitle: { fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 9 },
  stateText: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 5 },
  retryButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12 },
  retryText: { fontSize: 11, fontWeight: "800" },
  formHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  closeButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontSize: 12, fontWeight: "800", marginTop: 15, marginBottom: 7 },
  input: { minHeight: 45, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 },
  multiline: { minHeight: 78, paddingTop: 11, textAlignVertical: "top" },
  errorText: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  submitButton: { minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 17 },
  disabled: { opacity: 0.65 },
  pressed: { opacity: 0.78 },
});
