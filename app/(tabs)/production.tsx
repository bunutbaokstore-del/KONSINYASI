import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { formatProductPrice, useMitraProducts } from "@/lib/mitra-products";
import { saveMitraProductionBudget, type BudgetPeriod, useMitraProductionBudgets } from "@/lib/mitra-production-budgets";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const PERIODS: BudgetPeriod[] = ["Hari", "Minggu", "Bulan"];

export default function ProductionScreen() {
  const colors = useColors();
  const products = useMitraProducts();
  const budgets = useMitraProductionBudgets();
  const [isBudgetOpen, setBudgetOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [period, setPeriod] = useState<BudgetPeriod>("Bulan");
  const [productionBudget, setProductionBudget] = useState("");
  const [productionTarget, setProductionTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const savedBudget = selectedProductId ? budgets.get(`${selectedProductId}:${period}`) : undefined;

  useEffect(() => {
    if (!selectedProductId) return;
    const saved = budgets.get(`${selectedProductId}:${period}`);
    setProductionBudget(saved ? String(saved.productionBudget) : "");
    setProductionTarget(saved ? String(saved.productionTarget) : "");
    setSavedMessage(saved ? "Pengaturan tersimpan dimuat kembali." : null);
    setError(null);
  }, [budgets, period, selectedProductId]);

  const handleSave = () => {
    if (!selectedProductId) {
      setError("Pilih produk terlebih dahulu.");
      return;
    }
    const budget = Number(productionBudget.replace(/[^0-9]/g, ""));
    const target = Number(productionTarget.replace(/[^0-9]/g, ""));
    if (!productionBudget.trim() || !productionTarget.trim() || !Number.isFinite(budget) || budget <= 0 || !Number.isFinite(target) || target <= 0) {
      setError("Masukkan anggaran dan target produksi yang lebih besar dari 0.");
      return;
    }
    saveMitraProductionBudget({ productId: selectedProductId, period, productionBudget: budget, productionTarget: target });
    setError(null);
    setSavedMessage("Pengaturan berhasil disimpan dan siap digunakan pada fitur produksi berikutnya.");
  };

  return (
    <ScreenContainer className="px-5">
      <FlatList
        data={isBudgetOpen ? products : []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG PRODUKSI</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>Produksi</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Atur anggaran produksi berdasarkan produk dari Master Produk.</Text>
              </View>
              <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}18` }]}><AppIcon name="building" size={25} color={colors.primary} /></View>
            </View>
            <Pressable accessibilityRole="button" onPress={() => { setBudgetOpen((open) => !open); setError(null); }} style={({ pressed }) => [styles.budgetCard, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
              <View style={[styles.budgetIcon, { backgroundColor: `${colors.background}25` }]}><AppIcon name="wallet" size={23} color={colors.background} /></View>
              <View style={styles.budgetCopy}><Text style={[styles.budgetTitle, { color: colors.background }]}>Buat Anggaran</Text><Text style={[styles.budgetSubtitle, { color: "#D9EFE5" }]}>{isBudgetOpen ? "Atur pengaturan produksi" : "Tentukan target dan anggaran produksi"}</Text></View>
              <AppIcon name={isBudgetOpen ? "chevron-left" : "chevron-right"} size={21} color={colors.background} />
            </Pressable>
            {isBudgetOpen ? (
              <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.formTitle, { color: colors.foreground }]}>Buat Anggaran</Text>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Pilih Produk</Text>
                <Text style={[styles.helper, { color: colors.muted }]}>Pilih dari daftar Master Produk di bawah.</Text>
                {selectedProduct ? <View style={[styles.selectedCard, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]}><View style={styles.selectedCopy}><Text style={[styles.selectedLabel, { color: colors.primary }]}>PRODUK TERPILIH</Text><Text style={[styles.selectedName, { color: colors.foreground }]}>{selectedProduct.name}</Text><Text style={[styles.selectedMeta, { color: colors.muted }]}>{selectedProduct.category} · {selectedProduct.size} · {formatProductPrice(selectedProduct.sellingPrice)}</Text></View><AppIcon name="verified" size={22} color={colors.primary} /></View> : <Text style={[styles.emptySelection, { color: colors.muted }]}>Belum ada produk dipilih.</Text>}
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Periode Anggaran</Text>
                <View style={styles.chipRow}>{PERIODS.map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => setPeriod(value)} style={({ pressed }) => [styles.chip, { borderColor: period === value ? colors.primary : colors.border, backgroundColor: period === value ? `${colors.primary}16` : colors.background }, pressed && styles.pressed]}><Text style={[styles.chipText, { color: period === value ? colors.primary : colors.muted }]}>{value}</Text></Pressable>)}</View>
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Anggaran Produksi</Text>
                <TextInput value={productionBudget} onChangeText={setProductionBudget} placeholder="Contoh: 1500000" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Target Produksi</Text>
                <TextInput value={productionTarget} onChangeText={setProductionTarget} placeholder="Contoh: 100" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
                {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
                <Pressable accessibilityRole="button" onPress={handleSave} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><AppIcon name="verified" size={18} color={colors.background} /><Text style={[styles.saveText, { color: colors.background }]}>Simpan Pengaturan</Text></Pressable>
                {savedMessage ? <View style={[styles.savedNote, { backgroundColor: `${colors.success}14` }]}><AppIcon name="verified" size={17} color={colors.success} /><Text style={[styles.savedText, { color: colors.success }]}>{savedMessage}</Text></View> : null}
                {savedBudget ? <Text style={[styles.readback, { color: colors.muted }]}>Tersimpan untuk {savedBudget.period}: Rp {new Intl.NumberFormat("id-ID").format(savedBudget.productionBudget)} · target {savedBudget.productionTarget} unit.</Text> : null}
                <Text style={[styles.listLabel, { color: colors.foreground }]}>Daftar produk</Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Pilih produk ${item.name}`} onPress={() => { setSelectedProductId(item.id); setSavedMessage(null); }} style={({ pressed }) => [styles.productOption, { backgroundColor: colors.surface, borderColor: item.id === selectedProductId ? colors.primary : colors.border }, pressed && styles.pressed]}><View style={[styles.productIcon, { backgroundColor: `${colors.primary}18` }]}><AppIcon name="shippingbox" size={21} color={colors.primary} /></View><View style={styles.productCopy}><Text style={[styles.productName, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.productMeta, { color: colors.muted }]}>{item.category} · {item.unit} · {item.size}</Text></View>{item.id === selectedProductId ? <AppIcon name="verified" size={21} color={colors.primary} /> : null}</Pressable>}
        ListEmptyComponent={isBudgetOpen ? <Text style={[styles.emptyText, { color: colors.muted }]}>Belum ada produk. Tambahkan produk dari menu Produk.</Text> : null}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 14, paddingBottom: 28 }, headerRow: { flexDirection: "row", alignItems: "flex-start" }, headerCopy: { flex: 1 }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 7 }, title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 }, subtitle: { fontSize: 13, lineHeight: 19, marginTop: 8, paddingRight: 12 }, headerIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 }, budgetCard: { flexDirection: "row", alignItems: "center", borderRadius: 19, padding: 15, marginTop: 22 }, budgetIcon: { width: 45, height: 45, borderRadius: 14, alignItems: "center", justifyContent: "center" }, budgetCopy: { flex: 1, marginLeft: 12 }, budgetTitle: { fontSize: 16, fontWeight: "800" }, budgetSubtitle: { fontSize: 12, marginTop: 4 }, formCard: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 14 }, formTitle: { fontSize: 18, fontWeight: "800" }, fieldLabel: { fontSize: 12, fontWeight: "800", marginTop: 16, marginBottom: 7 }, helper: { fontSize: 12, lineHeight: 18 }, selectedCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 12 }, selectedCopy: { flex: 1 }, selectedLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 }, selectedName: { fontSize: 14, fontWeight: "800", marginTop: 5 }, selectedMeta: { fontSize: 11, marginTop: 4 }, emptySelection: { fontSize: 12, marginTop: 6 }, chipRow: { flexDirection: "row", gap: 8 }, chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 }, chipText: { fontSize: 12, fontWeight: "700" }, input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 }, errorText: { fontSize: 12, lineHeight: 18, marginTop: 12 }, saveButton: { minHeight: 47, borderRadius: 13, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 17 }, saveText: { fontSize: 14, fontWeight: "800" }, savedNote: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 11, padding: 10, marginTop: 12 }, savedText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "700" }, readback: { fontSize: 11, lineHeight: 17, marginTop: 10 }, listLabel: { fontSize: 12, fontWeight: "800", marginTop: 18 }, productOption: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 9 }, productIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" }, productCopy: { flex: 1, marginLeft: 11 }, productName: { fontSize: 14, fontWeight: "800" }, productMeta: { fontSize: 11, marginTop: 4 }, emptyText: { fontSize: 12, lineHeight: 18, paddingVertical: 18 }, pressed: { opacity: 0.78 },
});
