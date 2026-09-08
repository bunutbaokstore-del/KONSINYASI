import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { calculateHppSummary, type HppComponent, type HppComponentType, type MitraProductionHpp } from "@/shared/hpp";
import type { MitraProduct } from "@/lib/mitra-products";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const COMPONENT_TYPES: HppComponentType[] = ["Bahan Baku", "Bahan Penunjang", "Tenaga Produksi"];
const DEFAULT_COMPONENTS: Record<HppComponentType, string[]> = {
  "Bahan Baku": ["Kopi Biji", "Gula"],
  "Bahan Penunjang": ["Kemasan 150G", "Label"],
  "Tenaga Produksi": ["Sangrai", "Penggilingan", "Pengemasan"],
};

type Colors = ReturnType<typeof useColors>;

type Props = {
  colors: Colors;
  product: MitraProduct | null;
  savedHpp?: MitraProductionHpp;
  onSave: (components: HppComponent[], outputQuantity: number) => void;
  message: string | null;
  error: string | null;
  isSaving: boolean;
};

function newComponent(type: HppComponentType, name: string): HppComponent {
  return { id: `hpp-component-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, name, cost: 0 };
}

export function MitraHppEditor({ colors, product, savedHpp, onSave, message, error, isSaving }: Props) {
  const [components, setComponents] = useState<HppComponent[]>([]);
  const [outputQuantity, setOutputQuantity] = useState("");
  const [newType, setNewType] = useState<HppComponentType>("Bahan Baku");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setComponents(savedHpp?.components ?? COMPONENT_TYPES.flatMap((type) => DEFAULT_COMPONENTS[type].map((name) => newComponent(type, name))));
    setOutputQuantity(savedHpp ? String(savedHpp.outputQuantity) : "");
  }, [product?.id, savedHpp]);

  const output = Number(outputQuantity.replace(/[^0-9]/g, ""));
  const summary = useMemo(() => calculateHppSummary(components, output), [components, output]);

  const updateComponent = (id: string, field: "name" | "cost", value: string) => {
    setComponents((current) => current.map((component) => component.id === id ? { ...component, [field]: field === "cost" ? Number(value.replace(/[^0-9]/g, "")) || 0 : value } : component));
  };

  const addComponent = () => {
    const name = newName.trim() || `Komponen ${newType}`;
    setComponents((current) => [...current, newComponent(newType, name)]);
    setNewName("");
  };

  const removeComponent = (id: string) => setComponents((current) => current.filter((component) => component.id !== id));

  return <View style={[styles.editor, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.editorTitle, { color: colors.foreground }]}>HPP Produksi</Text>
    <Text style={[styles.helper, { color: colors.muted }]}>Pilih produk dari Master Produk. Setiap produk memiliki konfigurasi HPP sendiri.</Text>
    {product ? <View style={[styles.productBanner, { backgroundColor: `${colors.primary}12`, borderColor: colors.primary }]}><AppIcon name="shippingbox" size={20} color={colors.primary} /><View style={styles.bannerCopy}><Text style={[styles.bannerName, { color: colors.foreground }]}>{product.name}</Text><Text style={[styles.bannerMeta, { color: colors.muted }]}>{product.category} · Harga jual {formatCurrency(product.sellingPrice)}</Text></View></View> : <Text style={[styles.emptySelection, { color: colors.muted }]}>Pilih produk untuk mengatur HPP.</Text>}
    {product ? <>
      {COMPONENT_TYPES.map((type) => <View key={type} style={styles.group}><View style={styles.groupHeader}><Text style={[styles.groupTitle, { color: colors.foreground }]}>{type}</Text><Text style={[styles.groupTotal, { color: colors.primary }]}>{formatCurrency(summaryForType(summary, type, components))}</Text></View>{components.filter((component) => component.type === type).map((component) => <View key={component.id} style={[styles.componentRow, { borderColor: colors.border }]}><View style={styles.componentInputs}><TextInput value={component.name} onChangeText={(value) => updateComponent(component.id, "name", value)} placeholder="Nama komponen" placeholderTextColor={colors.muted} style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border }]} /><TextInput value={component.cost ? String(component.cost) : ""} onChangeText={(value) => updateComponent(component.id, "cost", value)} placeholder="Biaya" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.costInput, { color: colors.foreground, borderColor: colors.border }]} /></View><Pressable accessibilityRole="button" accessibilityLabel={`Hapus ${component.name}`} onPress={() => removeComponent(component.id)} style={({ pressed }) => [styles.removeButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.removeText, { color: colors.error }]}>Hapus</Text></Pressable></View>)}<Text style={[styles.emptyGroup, { color: colors.muted }]}>{components.some((component) => component.type === type) ? "" : "Belum ada komponen."}</Text></View>)}
      <View style={[styles.addBox, { borderColor: colors.border }]}><Text style={[styles.addTitle, { color: colors.foreground }]}>Tambah Komponen</Text><View style={styles.chipRow}>{COMPONENT_TYPES.map((type) => <Pressable key={type} accessibilityRole="button" onPress={() => setNewType(type)} style={[styles.chip, { borderColor: newType === type ? colors.primary : colors.border, backgroundColor: newType === type ? `${colors.primary}14` : colors.background }]}><Text style={[styles.chipText, { color: newType === type ? colors.primary : colors.muted }]}>{type}</Text></Pressable>)}</View><View style={styles.addInputs}><TextInput value={newName} onChangeText={setNewName} placeholder="Nama komponen baru" placeholderTextColor={colors.muted} style={[styles.addNameInput, { color: colors.foreground, borderColor: colors.border }]} /><Pressable accessibilityRole="button" onPress={addComponent} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><AppIcon name="add" size={18} color={colors.background} /><Text style={[styles.addButtonText, { color: colors.background }]}>Tambah</Text></Pressable></View></View>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Jumlah Hasil Produksi</Text><TextInput value={outputQuantity} onChangeText={setOutputQuantity} placeholder="Contoh: 100 unit" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
      <View style={[styles.summary, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.summaryTitle, { color: colors.foreground }]}>Ringkasan HPP</Text><SummaryRow label="Total Bahan Baku" value={summary.totalRawMaterials} colors={colors} /><SummaryRow label="Total Bahan Penunjang" value={summary.totalSupportingMaterials} colors={colors} /><SummaryRow label="Total Tenaga Produksi" value={summary.totalLabor} colors={colors} /><View style={[styles.grandTotal, { borderTopColor: colors.border }]}><Text style={[styles.grandLabel, { color: colors.foreground }]}>Total Biaya Produksi</Text><Text style={[styles.grandValue, { color: colors.primary }]}>{formatCurrency(summary.totalProductionCost)}</Text></View><SummaryRow label="Jumlah Hasil Produksi" value={output} colors={colors} suffix=" unit" /><View style={[styles.grandTotal, { borderTopColor: colors.border }]}><Text style={[styles.grandLabel, { color: colors.foreground }]}>HPP / Unit</Text><Text style={[styles.grandValue, { color: colors.primary }]}>{formatCurrency(summary.costPerUnit)}</Text></View></View>
      {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}<Pressable accessibilityRole="button" disabled={isSaving} onPress={() => onSave(components, output)} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary, opacity: isSaving ? 0.65 : 1 }, pressed && styles.pressed]}><AppIcon name="verified" size={18} color={colors.background} /><Text style={[styles.saveText, { color: colors.background }]}>{isSaving ? "Menyimpan..." : "Simpan HPP"}</Text></Pressable>{message ? <Text style={[styles.savedText, { color: colors.success }]}>{message}</Text> : null}
    </> : null}
  </View>;
}

function summaryForType(summary: ReturnType<typeof calculateHppSummary>, type: HppComponentType, components: HppComponent[]) {
  if (type === "Bahan Baku") return summary.totalRawMaterials;
  if (type === "Bahan Penunjang") return summary.totalSupportingMaterials;
  return summary.totalLabor;
}

function SummaryRow({ label, value, colors, suffix = "" }: { label: string; value: number; colors: Colors; suffix?: string }) {
  return <View style={styles.summaryRow}><Text style={[styles.summaryLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatCurrency(value)}{suffix}</Text></View>;
}

function formatCurrency(value: number) {
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(value))}`;
}

const styles = StyleSheet.create({
  editor: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 14 }, editorTitle: { fontSize: 19, fontWeight: "800" }, helper: { fontSize: 12, lineHeight: 18, marginTop: 5 }, productBanner: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 13 }, bannerCopy: { flex: 1, marginLeft: 10 }, bannerName: { fontSize: 14, fontWeight: "800" }, bannerMeta: { fontSize: 11, marginTop: 4 }, emptySelection: { fontSize: 13, marginTop: 13 }, group: { marginTop: 18 }, groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }, groupTitle: { fontSize: 14, fontWeight: "800" }, groupTotal: { fontSize: 12, fontWeight: "800" }, componentRow: { borderWidth: 1, borderRadius: 12, padding: 9, marginBottom: 8 }, componentInputs: { flexDirection: "row", gap: 8 }, nameInput: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, fontSize: 12 }, costInput: { width: 104, minHeight: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, fontSize: 12 }, removeButton: { alignSelf: "flex-end", borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, marginTop: 7 }, removeText: { fontSize: 11, fontWeight: "700" }, emptyGroup: { fontSize: 11 }, addBox: { borderWidth: 1, borderRadius: 13, padding: 11, marginTop: 8 }, addTitle: { fontSize: 12, fontWeight: "800", marginBottom: 9 }, chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, chip: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7 }, chipText: { fontSize: 10, fontWeight: "700" }, addInputs: { flexDirection: "row", gap: 8, marginTop: 9 }, addNameInput: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, fontSize: 12 }, addButton: { minHeight: 42, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11 }, addButtonText: { fontSize: 12, fontWeight: "800" }, fieldLabel: { fontSize: 12, fontWeight: "800", marginTop: 17, marginBottom: 7 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, summary: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 18 }, summaryTitle: { fontSize: 14, fontWeight: "800", marginBottom: 8 }, summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }, summaryLabel: { fontSize: 12 }, summaryValue: { fontSize: 12, fontWeight: "800" }, grandTotal: { borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 10, marginTop: 6 }, grandLabel: { fontSize: 13, fontWeight: "800" }, grandValue: { fontSize: 15, fontWeight: "800" }, errorText: { fontSize: 12, lineHeight: 18, marginTop: 12 }, saveButton: { minHeight: 47, borderRadius: 13, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 17 }, saveText: { fontSize: 14, fontWeight: "800" }, savedText: { fontSize: 12, fontWeight: "700", marginTop: 11 }, pressed: { opacity: 0.78 },
});
