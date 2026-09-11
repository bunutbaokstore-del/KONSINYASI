import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import type { ConsignmentItem } from "@/shared/consignment";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const emptyForm = {
  mitraUserId: "",
  name: "",
  sku: "",
  unit: "pcs",
  stockQuantity: "0",
  minimumStock: "0",
};

type FormState = typeof emptyForm;

export default function ManageInventoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const inventoryQuery = trpc.inventory.list.useQuery(undefined, { enabled: isAuthenticated && (user?.role === "admin" || user?.role === "distributor") });
  const mitrasQuery = trpc.inventory.mitras.useQuery(undefined, { enabled: isAuthenticated && (user?.role === "admin" || user?.role === "distributor") });
  const updateMutation = trpc.inventory.update.useMutation();
  const removeMutation = trpc.inventory.remove.useMutation();
  const isSaving = updateMutation.isPending;
  const items = inventoryQuery.data ?? [];
  const isManager = user?.role === "admin" || user?.role === "distributor";
  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)" as never); };

  const selectedMitra = useMemo(() => mitrasQuery.data?.find((mitra) => mitra.id === form.mitraUserId), [form.mitraUserId, mitrasQuery.data]);

  const updateField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
  };

  const handleSubmit = async () => {
    const stockQuantity = Number(form.stockQuantity);
    const minimumStock = Number(form.minimumStock);
    if (!form.mitraUserId) return setFormError("Pilih Mitra UMKM terlebih dahulu.");
    if (!form.name.trim()) return setFormError("Nama barang wajib diisi.");
    if (!form.unit.trim()) return setFormError("Satuan wajib diisi.");
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) return setFormError("Stok harus berupa bilangan bulat 0 atau lebih.");
    if (!Number.isInteger(minimumStock) || minimumStock < 0) return setFormError("Batas minimum stok harus berupa bilangan bulat 0 atau lebih.");

    const input = {
      mitraUserId: form.mitraUserId,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      unit: form.unit.trim(),
      stockQuantity,
      minimumStock,
    };

    if (!editingId) {
      setFormError("Barang baru hanya dapat ditambahkan melalui persetujuan supplier.");
      return;
    }

    try {
      await updateMutation.mutateAsync({ itemId: editingId, ...input });
      await inventoryQuery.refetch();
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Barang belum dapat disimpan.");
    }
  };

  const startEdit = (item: ConsignmentItem) => {
    if (!item.mitraUserId) {
      setFormError("Relasi Mitra untuk barang ini tidak ditemukan.");
      return;
    }
    setEditingId(item.id);
    setForm({ mitraUserId: item.mitraUserId, name: item.name, sku: item.sku ?? "", unit: item.unit, stockQuantity: String(item.stockQuantity), minimumStock: String(item.minimumStock) });
    setFormError(null);
  };

  const confirmRemove = (item: ConsignmentItem) => {
    Alert.alert("Hapus barang titipan?", `Barang “${item.name}” akan dihapus dari ruang kerja.`, [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", style: "destructive", onPress: () => void removeItem(item.id) },
    ]);
  };

  const removeItem = async (itemId: string) => {
    try {
      await removeMutation.mutateAsync({ itemId });
      await inventoryQuery.refetch();
      if (editingId === itemId) resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Barang belum dapat dihapus.");
    }
  };

  if (loading) return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center"><ActivityIndicator size="large" color={colors.primary} /></ScreenContainer>;
  if (!isAuthenticated || !isManager) return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center px-6"><Text style={[styles.deniedTitle, { color: colors.foreground }]}>Akses tidak tersedia</Text><Text style={[styles.deniedText, { color: colors.muted }]}>Halaman ini hanya dapat digunakan oleh Admin atau Distributor.</Text><Pressable onPress={goBack} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Kembali</Text></Pressable></ScreenContainer>;

  return (
    <ScreenContainer className="px-5">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={inventoryQuery.isRefetching} onRefresh={() => void inventoryQuery.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={<View>
          <View style={styles.headerRow}><Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={goBack} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.backText, { color: colors.foreground }]}>‹</Text></Pressable><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG KERJA</Text><Text style={[styles.title, { color: colors.foreground }]}>Kelola barang titipan</Text></View><View style={[styles.headerIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={20} color={colors.primary} /></View></View>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Pantau barang dan stok resmi untuk setiap Mitra UMKM. Barang baru masuk melalui persetujuan supplier.</Text>
          {editingId ? <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.formTitleRow}><Text style={[styles.formTitle, { color: colors.foreground }]}>Edit barang titipan</Text><Pressable onPress={resetForm} accessibilityRole="button"><Text style={[styles.cancelText, { color: colors.primary }]}>Batal edit</Text></Pressable></View>
            <Text style={[styles.label, { color: colors.foreground }]}>Mitra UMKM</Text>
            {mitrasQuery.isLoading ? <ActivityIndicator color={colors.primary} /> : mitrasQuery.data?.length ? <FlatList horizontal data={mitrasQuery.data} keyExtractor={(mitra) => mitra.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mitraList} renderItem={({ item: mitra }) => <Pressable onPress={() => updateField("mitraUserId", mitra.id)} style={({ pressed }) => [styles.mitraChip, { borderColor: form.mitraUserId === mitra.id ? colors.primary : colors.border, backgroundColor: form.mitraUserId === mitra.id ? `${colors.primary}16` : colors.background }, pressed && styles.pressed]}><Text style={[styles.mitraName, { color: form.mitraUserId === mitra.id ? colors.primary : colors.foreground }]}>{mitra.name}</Text></Pressable>} /> : <Text style={[styles.helperText, { color: colors.muted }]}>Belum ada Mitra UMKM dalam ruang kerja ini.</Text>}
            {selectedMitra ? <Text style={[styles.selectedText, { color: colors.primary }]}>Dipilih: {selectedMitra.name}</Text> : null}
            <Text style={[styles.label, { color: colors.foreground }]}>Nama barang</Text><TextInput value={form.name} onChangeText={(value) => updateField("name", value)} placeholder="Contoh: Keripik pisang" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Kode barang (opsional)</Text><TextInput value={form.sku} onChangeText={(value) => updateField("sku", value)} placeholder="Contoh: KP-001" placeholderTextColor={colors.muted} autoCapitalize="characters" style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <View style={styles.twoColumns}><View style={styles.column}><Text style={[styles.label, { color: colors.foreground }]}>Satuan</Text><TextInput value={form.unit} onChangeText={(value) => updateField("unit", value)} placeholder="pcs" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} /></View><View style={styles.column}><Text style={[styles.label, { color: colors.foreground }]}>Stok saat ini</Text><TextInput value={form.stockQuantity} editable={false} placeholder="0" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.muted, backgroundColor: colors.background, borderColor: colors.border }]} /></View></View>
            <Text style={[styles.label, { color: colors.foreground }]}>Batas minimum stok</Text><TextInput value={form.minimumStock} onChangeText={(value) => updateField("minimumStock", value.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Text style={[styles.helperText, { color: colors.muted }]}>Perubahan stok hanya dapat dilakukan melalui pengajuan supplier yang disetujui.</Text>
            {formError ? <Text style={[styles.errorText, { color: colors.error }]}>{formError}</Text> : null}
            <Pressable accessibilityRole="button" onPress={() => void handleSubmit()} disabled={isSaving} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed, isSaving && styles.disabled]}>{isSaving ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryButtonText, { color: colors.background }]}>Simpan perubahan</Text>}</Pressable>
          </View> : <View style={[styles.infoCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}35` }]}><AppIcon name="verified" size={24} color={colors.primary} /><View style={styles.infoCopy}><Text style={[styles.infoTitle, { color: colors.foreground }]}>Barang resmi masuk melalui persetujuan</Text><Text style={[styles.infoText, { color: colors.muted }]}>Tidak ada tombol Tambah Barang di sini. Buka Persetujuan Supplier untuk memproses pengajuan Mitra UMKM.</Text><Pressable accessibilityRole="button" onPress={() => router.push("/supplier-requests")} style={({ pressed }) => [styles.infoAction, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.infoActionText, { color: colors.primary }]}>Buka Persetujuan Supplier</Text></Pressable></View></View>}
          <View style={styles.sectionHeader}><View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daftar barang</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{items.length} barang dalam ruang kerja</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Muat ulang daftar barang" onPress={() => void inventoryQuery.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={18} color={colors.primary} /></Pressable></View>
        </View>}
        renderItem={({ item }) => {
          const statusColor = item.status === "aman" ? colors.success : item.status === "menipis" ? colors.warning : colors.error;
          const statusLabel = item.status === "aman" ? "Aman" : item.status === "menipis" ? "Menipis" : "Habis";
          const mitraName = mitrasQuery.data?.find((mitra) => mitra.id === item.mitraUserId)?.name;
          return <View style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.itemIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={21} color={colors.primary} /></View><View style={styles.itemCopy}><Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.itemMeta, { color: colors.muted }]}>{mitraName ?? "Mitra UMKM"}{item.sku ? ` · ${item.sku}` : ""}</Text><Text style={[styles.itemStock, { color: colors.muted }]}>Stok {item.stockQuantity} {item.unit} · minimum {item.minimumStock}</Text><Text style={[styles.status, { color: statusColor, backgroundColor: `${statusColor}16` }]}>{statusLabel}</Text></View><View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => startEdit(item)} style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.actionText, { color: colors.primary }]}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Hapus ${item.name}`} onPress={() => confirmRemove(item)} style={({ pressed }) => [styles.actionButton, { borderColor: `${colors.error}50` }, pressed && styles.pressed]}><Text style={[styles.actionText, { color: colors.error }]}>Hapus</Text></Pressable></View></View>;
        }}
        ListEmptyComponent={inventoryQuery.isLoading ? <View style={styles.loadingBlock}><ActivityIndicator color={colors.primary} /></View> :           <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppIcon name="inventory" size={28} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Belum ada barang titipan</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Barang akan tampil setelah pengajuan supplier disetujui Admin.</Text></View>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", paddingTop: 12 },
  backButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 29, lineHeight: 32, marginTop: -2 },
  headerCopy: { flex: 1, marginLeft: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 23, lineHeight: 29, fontWeight: "800", marginTop: 2 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 16 },
  formCard: { borderWidth: 1, borderRadius: 20, padding: 16 },
  formTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  formTitle: { fontSize: 17, fontWeight: "800" },
  infoCard: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 2 },
  infoCopy: { flex: 1 },
  infoTitle: { fontSize: 14, lineHeight: 20, fontWeight: "800" },
  infoText: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  infoAction: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, marginTop: 11 },
  infoActionText: { fontSize: 12, fontWeight: "800" },
  cancelText: { fontSize: 12, fontWeight: "800" },
  label: { fontSize: 12, fontWeight: "800", marginTop: 14, marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 },
  mitraList: { gap: 8, paddingVertical: 2 },
  mitraChip: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9 },
  mitraName: { fontSize: 12, fontWeight: "800" },
  helperText: { fontSize: 12, lineHeight: 18 },
  selectedText: { fontSize: 11, fontWeight: "700", marginTop: 6 },
  twoColumns: { flexDirection: "row", gap: 10 },
  column: { flex: 1 },
  errorText: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  primaryButton: { minHeight: 49, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 16 },
  primaryButtonText: { fontSize: 14, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { fontSize: 11, marginTop: 3 },
  refreshButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  itemCard: { flexDirection: "row", alignItems: "flex-start", borderWidth: 1, borderRadius: 17, padding: 12, marginBottom: 10 },
  itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  itemCopy: { flex: 1, marginLeft: 10, paddingRight: 7 },
  itemName: { fontSize: 14, fontWeight: "800" },
  itemMeta: { fontSize: 10, marginTop: 4 },
  itemStock: { fontSize: 10, marginTop: 4 },
  status: { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, fontSize: 10, fontWeight: "800", marginTop: 7 },
  actions: { gap: 7, alignItems: "flex-end" },
  actionButton: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  actionText: { fontSize: 10, fontWeight: "800" },
  listContent: { paddingBottom: 30 },
  emptyCard: { borderWidth: 1, borderRadius: 17, alignItems: "center", padding: 22, marginTop: 3 },
  emptyTitle: { fontSize: 14, fontWeight: "800", marginTop: 9 },
  emptyText: { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 4 },
  loadingBlock: { paddingVertical: 30, alignItems: "center" },
  deniedTitle: { fontSize: 19, fontWeight: "800" },
  deniedText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  secondaryButton: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 16 },
  secondaryButtonText: { fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
});
