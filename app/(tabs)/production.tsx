import { ScreenContainer } from "@/components/screen-container";
import { MitraHppEditor } from "@/components/mitra-hpp-editor";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { formatProductPrice, useMitraProducts } from "@/lib/mitra-products";
import { saveMitraProductionBudget, type BudgetPeriod, useMitraProductionBudgets } from "@/lib/mitra-production-budgets";
import { saveMitraProductionHpp, useMitraProductionHpps } from "@/lib/mitra-production-hpp";
import { saveMitraProduction, updateMitraProductionResult, useMitraProductions, type MitraProduction, type ProductionStatus } from "@/lib/mitra-productions";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const PERIODS: BudgetPeriod[] = ["Hari", "Minggu", "Bulan"];
type ProductionView = "list" | "budget" | "results" | "hpp";

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ProductionScreen() {
  const colors = useColors();
  const products = useMitraProducts();
  const productions = useMitraProductions();
  const budgets = useMitraProductionBudgets();
  const hpps = useMitraProductionHpps();
  const [view, setView] = useState<ProductionView>("list");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [actualQuantity, setActualQuantity] = useState("");
  const [damagedQuantity, setDamagedQuantity] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [hppProductId, setHppProductId] = useState<string | null>(null);
  const [isProductionFormVisible, setProductionFormVisible] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [period, setPeriod] = useState<BudgetPeriod>("Bulan");
  const [productionDate, setProductionDate] = useState(today());
  const [productionQuantity, setProductionQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [budgetValue, setBudgetValue] = useState("");
  const [budgetTarget, setBudgetTarget] = useState("");
  const [budgetProductId, setBudgetProductId] = useState<string | null>(null);
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>("Bulan");
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const budgetForProduction = selectedProductId ? budgets.get(`${selectedProductId}:${period}`) : undefined;
  const budgetProduct = products.find((product) => product.id === budgetProductId) ?? null;
  const savedBudget = budgetProductId ? budgets.get(`${budgetProductId}:${budgetPeriod}`) : undefined;
  const selectedResult = productions.find((production) => production.id === selectedResultId) ?? null;
  const selectedHppProduct = products.find((product) => product.id === hppProductId) ?? null;

  useEffect(() => {
    if (!budgetProductId) return;
    const saved = budgets.get(`${budgetProductId}:${budgetPeriod}`);
    setBudgetValue(saved ? String(saved.productionBudget) : "");
    setBudgetTarget(saved ? String(saved.productionTarget) : "");
    setSavedMessage(saved ? "Pengaturan tersimpan dimuat kembali." : null);
  }, [budgetPeriod, budgetProductId, budgets]);

  useEffect(() => {
    if (!selectedResult) return;
    setActualQuantity(selectedResult.actualQuantity === null ? "" : String(selectedResult.actualQuantity));
    setDamagedQuantity(selectedResult.damagedQuantity === null ? "" : String(selectedResult.damagedQuantity));
    setResultNotes(selectedResult.resultNotes);
  }, [selectedResult]);

  const selectProductionProduct = (productId: string) => {
    setSelectedProductId(productId);
    setError(null);
    setSavedMessage(null);
  };

  useEffect(() => {
    if (!selectedResult) return;
    setActualQuantity(selectedResult.actualQuantity === null ? "" : String(selectedResult.actualQuantity));
    setDamagedQuantity(selectedResult.damagedQuantity === null ? "" : String(selectedResult.damagedQuantity));
    setResultNotes(selectedResult.resultNotes);
  }, [selectedResult]);

  const handleSaveProduction = () => {
    if (!selectedProductId) {
      setError("Pilih produk terlebih dahulu.");
      return;
    }
    if (!budgetForProduction) {
      setError(`Belum ada anggaran ${period.toLowerCase()} untuk produk ini. Buat anggaran terlebih dahulu.`);
      return;
    }
    const quantity = Number(productionQuantity.replace(/[^0-9]/g, ""));
    if (!productionDate.trim() || !productionQuantity.trim() || !Number.isFinite(quantity) || quantity <= 0) {
      setError("Lengkapi tanggal dan masukkan jumlah produksi yang lebih besar dari 0.");
      return;
    }
    saveMitraProduction({ productId: selectedProductId, productionDate: productionDate.trim(), budgetPeriod: period, targetQuantity: budgetForProduction.productionTarget, notes: notes.trim() });
    setProductionDate(today());
    setProductionQuantity("");
    setNotes("");
    setError(null);
    setSavedMessage("Produksi berhasil disimpan ke Daftar Produksi.");
    setProductionFormVisible(false);
  };

  const handleSaveHpp = (components: Parameters<typeof saveMitraProductionHpp>[0]["components"], outputQuantity: number) => {
    if (!hppProductId) {
      setError("Pilih produk terlebih dahulu.");
      return;
    }
    if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) {
      setError("Masukkan jumlah hasil produksi yang lebih besar dari 0.");
      return;
    }
    saveMitraProductionHpp({ productId: hppProductId, components, outputQuantity });
    setError(null);
    setSavedMessage("HPP berhasil disimpan untuk produk ini.");
  };

  const handleSaveResult = () => {
    if (!selectedResult) {
      setError("Pilih produksi terlebih dahulu.");
      return;
    }
    const actual = Number(actualQuantity.replace(/[^0-9]/g, ""));
    const damaged = damagedQuantity.trim() ? Number(damagedQuantity.replace(/[^0-9]/g, "")) : 0;
    if (!actualQuantity.trim() || !Number.isFinite(actual) || actual <= 0 || !Number.isFinite(damaged) || damaged < 0) {
      setError("Masukkan hasil aktual dan rusak/susut yang valid.");
      return;
    }
    const percentage = selectedResult.targetQuantity > 0 ? Number(((actual / selectedResult.targetQuantity) * 100).toFixed(2)) : 0;
    updateMitraProductionResult({ id: selectedResult.id, actualQuantity: actual, damagedQuantity: damaged, yieldPercentage: percentage, resultNotes: resultNotes.trim() });
    setError(null);
    setSavedMessage("Hasil produksi tersimpan dan status berubah menjadi Selesai.");
  };

  const handleSaveBudget = () => {
    if (!budgetProductId) {
      setError("Pilih produk terlebih dahulu.");
      return;
    }
    const budget = Number(budgetValue.replace(/[^0-9]/g, ""));
    const target = Number(budgetTarget.replace(/[^0-9]/g, ""));
    if (!budgetValue.trim() || !budgetTarget.trim() || !Number.isFinite(budget) || budget <= 0 || !Number.isFinite(target) || target <= 0) {
      setError("Masukkan anggaran dan target produksi yang lebih besar dari 0.");
      return;
    }
    saveMitraProductionBudget({ productId: budgetProductId, period: budgetPeriod, productionBudget: budget, productionTarget: target });
    setError(null);
    setSavedMessage("Pengaturan berhasil disimpan dan siap digunakan untuk Tambah Produksi.");
  };

  const switchView = (nextView: ProductionView) => {
    setView(nextView);
    setError(null);
    setSavedMessage(null);
    if (nextView !== "results" && nextView !== "hpp") {
      setSelectedResultId(null);
      setActualQuantity("");
      setDamagedQuantity("");
      setResultNotes("");
    }
  };

  return (
    <ScreenContainer className="px-5">
      <FlatList<ReturnType<typeof useMitraProductions>[number] | ReturnType<typeof useMitraProducts>[number]>
        data={view === "budget" || view === "hpp" ? products : productions}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG PRODUKSI</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>Produksi</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Gunakan produk dan target dari Master Produk serta Anggaran Produksi.</Text>
              </View>
              <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}18` }]}><AppIcon name="building" size={25} color={colors.primary} /></View>
            </View>
            <View style={[styles.segment, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable accessibilityRole="button" onPress={() => switchView("list")} style={[styles.segmentButton, view === "list" && { backgroundColor: colors.primary }]}><Text style={[styles.segmentText, { color: view === "list" ? colors.background : colors.muted }]}>Daftar Produksi</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => switchView("results")} style={[styles.segmentButton, view === "results" && { backgroundColor: colors.primary }]}><Text style={[styles.segmentText, { color: view === "results" ? colors.background : colors.muted }]}>Hasil Produksi</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => switchView("hpp")} style={[styles.segmentButton, view === "hpp" && { backgroundColor: colors.primary }]}><Text style={[styles.segmentText, { color: view === "hpp" ? colors.background : colors.muted }]}>HPP Produksi</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => switchView("budget")} style={[styles.segmentButton, view === "budget" && { backgroundColor: colors.primary }]}><Text style={[styles.segmentText, { color: view === "budget" ? colors.background : colors.muted }]}>Buat Anggaran</Text></Pressable>
            </View>
            {view === "list" ? (
              <>
                <Pressable accessibilityRole="button" onPress={() => { setProductionFormVisible((visible) => !visible); setError(null); setSavedMessage(null); }} style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary }, pressed && styles.pressed]}><AppIcon name={isProductionFormVisible ? "close" : "add"} size={20} color={colors.background} /><Text style={[styles.primaryActionText, { color: colors.background }]}>{isProductionFormVisible ? "Tutup Form" : "Tambah Produksi"}</Text></Pressable>
                {isProductionFormVisible ? <ProductionForm colors={colors} products={products} selectedProductId={selectedProductId} onSelectProduct={selectProductionProduct} period={period} onSelectPeriod={(value) => { setPeriod(value); setError(null); }} productionDate={productionDate} onDateChange={setProductionDate} productionQuantity={productionQuantity} onQuantityChange={setProductionQuantity} notes={notes} onNotesChange={setNotes} target={budgetForProduction?.productionTarget ?? null} onSave={handleSaveProduction} error={error} /> : null}
                {savedMessage ? <Message text={savedMessage} colors={colors} /> : null}
                <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daftar Produksi</Text><Text style={[styles.countText, { color: colors.muted }]}>{productions.length} produksi</Text></View>
              </>
            ) : view === "budget" ? (
              <BudgetForm colors={colors} products={products} selectedProductId={budgetProductId} onSelectProduct={(id) => { setBudgetProductId(id); setError(null); }} period={budgetPeriod} onSelectPeriod={(value) => { setBudgetPeriod(value); setError(null); }} budgetValue={budgetValue} onBudgetChange={setBudgetValue} target={budgetTarget} onTargetChange={setBudgetTarget} onSave={handleSaveBudget} error={error} savedMessage={savedMessage} savedBudget={savedBudget} />
            ) : view === "results" ? (
              <ResultForm colors={colors} selectedProduction={selectedResult} actualQuantity={actualQuantity} onActualChange={setActualQuantity} damagedQuantity={damagedQuantity} onDamagedChange={setDamagedQuantity} resultNotes={resultNotes} onNotesChange={setResultNotes} onSave={handleSaveResult} error={error} savedMessage={savedMessage} />
            ) : (
              <MitraHppEditor colors={colors} product={selectedHppProduct} savedHpp={hppProductId ? hpps.get(hppProductId) : undefined} onSave={handleSaveHpp} error={error} message={savedMessage} />
            )}
          </View>
        }
        renderItem={({ item }) => "productId" in item ? view === "results" ? <ProductionSelectOption production={item} productName={products.find((product) => product.id === item.productId)?.name ?? "Produk tidak ditemukan"} selected={item.id === selectedResultId} onSelect={() => { setSelectedResultId(item.id); setError(null); setSavedMessage(null); }} colors={colors} /> : <ProductionCard production={item} productName={products.find((product) => product.id === item.productId)?.name ?? "Produk tidak ditemukan"} colors={colors} /> : <BudgetProductOption product={item} selected={view === "hpp" ? item.id === hppProductId : item.id === budgetProductId} onSelect={() => { if (view === "hpp") { setHppProductId(item.id); } else { setBudgetProductId(item.id); } setError(null); setSavedMessage(null); }} colors={colors} />}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.muted }]}>{view === "list" ? "Belum ada produksi. Tekan Tambah Produksi untuk membuat rencana baru." : view === "results" ? "Belum ada produksi dari Daftar Produksi." : "Belum ada produk. Tambahkan produk dari menu Produk."}</Text>}
      />
    </ScreenContainer>
  );
}

type Colors = ReturnType<typeof useColors>;

function ResultForm({ colors, selectedProduction, actualQuantity, onActualChange, damagedQuantity, onDamagedChange, resultNotes, onNotesChange, onSave, error, savedMessage }: { colors: Colors; selectedProduction: MitraProduction | null; actualQuantity: string; onActualChange: (value: string) => void; damagedQuantity: string; onDamagedChange: (value: string) => void; resultNotes: string; onNotesChange: (value: string) => void; onSave: () => void; error: string | null; savedMessage: string | null }) {
  const productLabel = selectedProduction ? "Produk terpilih dari Daftar Produksi" : "Pilih produksi dari daftar di bawah";
  return <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.formTitle, { color: colors.foreground }]}>Hasil Produksi</Text>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Pilih Produksi</Text>
    <Text style={[styles.helper, { color: colors.muted }]}>{productLabel}</Text>
    {selectedProduction ? <View style={[styles.selectedCard, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]}><View style={styles.selectedCopy}><Text style={[styles.selectedLabel, { color: colors.primary }]}>PRODUKSI TERPILIH</Text><Text style={[styles.selectedName, { color: colors.foreground }]}>{selectedProduction.productionDate}</Text><Text style={[styles.selectedMeta, { color: colors.muted }]}>Target {selectedProduction.targetQuantity} unit · {selectedProduction.budgetPeriod}</Text></View><AppIcon name="verified" size={22} color={colors.primary} /></View> : <Text style={[styles.emptySelection, { color: colors.muted }]}>Belum ada produksi dipilih.</Text>}
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Tanggal Produksi</Text>
    <View style={[styles.readOnlyInput, { backgroundColor: `${colors.primary}10`, borderColor: colors.border }]}><Text style={[styles.readOnlyText, { color: selectedProduction ? colors.foreground : colors.muted }]}>{selectedProduction?.productionDate ?? "Pilih produksi terlebih dahulu"}</Text></View>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Target Produksi</Text>
    <View style={[styles.readOnlyInput, { backgroundColor: `${colors.primary}10`, borderColor: colors.border }]}><Text style={[styles.readOnlyText, { color: selectedProduction ? colors.primary : colors.muted }]}>{selectedProduction ? `${selectedProduction.targetQuantity} unit` : "Target dari Daftar Produksi"}</Text></View>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Jumlah Produksi</Text>
    <View style={[styles.readOnlyInput, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.readOnlyText, { color: selectedProduction ? colors.foreground : colors.muted }]}>{selectedProduction ? `${selectedProduction.actualQuantity ?? "-"} unit` : "Belum tersedia"}</Text></View>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Hasil Aktual</Text>
    <TextInput value={actualQuantity} onChangeText={onActualChange} placeholder="Masukkan hasil aktual" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Rusak / Susut</Text>
    <TextInput value={damagedQuantity} onChangeText={onDamagedChange} placeholder="Masukkan jumlah rusak/susut (opsional)" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Persentase Hasil</Text>
    <View style={[styles.readOnlyInput, { backgroundColor: `${colors.success}12`, borderColor: colors.border }]}><Text style={[styles.readOnlyText, { color: colors.success }]}>{selectedProduction && actualQuantity ? `${((Number(actualQuantity.replace(/[^0-9]/g, "")) / selectedProduction.targetQuantity) * 100).toFixed(2)}% dari target` : "Terhitung setelah hasil aktual diisi"}</Text></View>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Catatan Hasil <Text style={{ fontWeight: "500", color: colors.muted }}>(opsional)</Text></Text>
    <TextInput value={resultNotes} onChangeText={onNotesChange} placeholder="Tambahkan catatan hasil" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.notesInput, { color: colors.foreground, borderColor: colors.border }]} />
    {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={onSave} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><AppIcon name="verified" size={18} color={colors.background} /><Text style={[styles.saveText, { color: colors.background }]}>Simpan Hasil</Text></Pressable>
    {savedMessage ? <Message text={savedMessage} colors={colors} /> : null}
  </View>;
}

function ProductionSelectOption({ production, productName, selected, onSelect, colors }: { production: MitraProduction; productName: string; selected: boolean; onSelect: () => void; colors: Colors }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Pilih produksi ${productName} tanggal ${production.productionDate}`} onPress={onSelect} style={({ pressed }) => [styles.productOption, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.border }, pressed && styles.pressed]}><View style={[styles.productIcon, { backgroundColor: `${colors.primary}18` }]}><AppIcon name="building" size={20} color={colors.primary} /></View><View style={styles.productCopy}><Text style={[styles.productName, { color: colors.foreground }]}>{productName}</Text><Text style={[styles.productMeta, { color: colors.muted }]}>{production.productionDate} · target {production.targetQuantity} unit · {production.budgetPeriod}</Text></View><View style={[styles.statusBadge, { backgroundColor: production.status === "Selesai" ? `${colors.success}18` : `${colors.warning}18` }]}><Text style={[styles.statusText, { color: production.status === "Selesai" ? colors.success : colors.warning }]}>{production.status}</Text></View></Pressable>;
}


function ProductionForm({ colors, products, selectedProductId, onSelectProduct, period, onSelectPeriod, productionDate, onDateChange, productionQuantity, onQuantityChange, notes, onNotesChange, target, onSave, error }: { colors: Colors; products: ReturnType<typeof useMitraProducts>; selectedProductId: string | null; onSelectProduct: (id: string) => void; period: BudgetPeriod; onSelectPeriod: (period: BudgetPeriod) => void; productionDate: string; onDateChange: (value: string) => void; productionQuantity: string; onQuantityChange: (value: string) => void; notes: string; onNotesChange: (value: string) => void; target: number | null; onSave: () => void; error: string | null }) {
  return <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.formTitle, { color: colors.foreground }]}>Tambah Produksi</Text>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Pilih Produk</Text>
    <Text style={[styles.helper, { color: colors.muted }]}>Produk diambil dari Master Produk.</Text>
    <View style={styles.optionList}>{products.map((product) => <BudgetProductOption key={product.id} product={product} selected={product.id === selectedProductId} onSelect={() => onSelectProduct(product.id)} colors={colors} compact />)}</View>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Periode Anggaran</Text>
    <ChipRow values={["Hari", "Minggu", "Bulan"]} selected={period} onSelect={(value) => onSelectPeriod(value as BudgetPeriod)} colors={colors} />
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Tanggal Produksi</Text>
    <TextInput value={productionDate} onChangeText={onDateChange} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Target Produksi</Text>
    <View style={[styles.readOnlyInput, { backgroundColor: `${colors.primary}10`, borderColor: colors.border }]}><Text style={[styles.readOnlyText, { color: target ? colors.primary : colors.muted }]}>{target ? `${target} unit (dari anggaran ${period.toLowerCase()})` : "Pilih produk dengan anggaran yang tersedia"}</Text></View>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Jumlah Produksi</Text>
    <TextInput value={productionQuantity} onChangeText={onQuantityChange} placeholder="Masukkan jumlah produksi" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Catatan Produksi <Text style={{ fontWeight: "500", color: colors.muted }}>(opsional)</Text></Text>
    <TextInput value={notes} onChangeText={onNotesChange} placeholder="Tambahkan catatan" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.notesInput, { color: colors.foreground, borderColor: colors.border }]} />
    {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={onSave} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><AppIcon name="verified" size={18} color={colors.background} /><Text style={[styles.saveText, { color: colors.background }]}>Simpan Produksi</Text></Pressable>
  </View>;
}

function BudgetForm({ colors, products, selectedProductId, onSelectProduct, period, onSelectPeriod, budgetValue, onBudgetChange, target, onTargetChange, onSave, error, savedMessage, savedBudget }: { colors: Colors; products: ReturnType<typeof useMitraProducts>; selectedProductId: string | null; onSelectProduct: (id: string) => void; period: BudgetPeriod; onSelectPeriod: (period: BudgetPeriod) => void; budgetValue: string; onBudgetChange: (value: string) => void; target: string; onTargetChange: (value: string) => void; onSave: () => void; error: string | null; savedMessage: string | null; savedBudget?: { period: BudgetPeriod; productionBudget: number; productionTarget: number } }) {
  return <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Text style={[styles.formTitle, { color: colors.foreground }]}>Buat Anggaran Produksi</Text>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Pilih Produk</Text>
    <Text style={[styles.helper, { color: colors.muted }]}>Produk diambil langsung dari Master Produk.</Text>
    <View style={styles.optionList}>{products.map((product) => <BudgetProductOption key={product.id} product={product} selected={product.id === selectedProductId} onSelect={() => onSelectProduct(product.id)} colors={colors} compact />)}</View>
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Periode Anggaran</Text>
    <ChipRow values={["Hari", "Minggu", "Bulan"]} selected={period} onSelect={(value) => onSelectPeriod(value as BudgetPeriod)} colors={colors} />
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Anggaran Produksi</Text>
    <TextInput value={budgetValue} onChangeText={onBudgetChange} placeholder="Contoh: 1500000" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Target Produksi</Text>
    <TextInput value={target} onChangeText={onTargetChange} placeholder="Contoh: 100" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
    {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={onSave} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><AppIcon name="verified" size={18} color={colors.background} /><Text style={[styles.saveText, { color: colors.background }]}>Simpan Pengaturan</Text></Pressable>
    {savedMessage ? <Message text={savedMessage} colors={colors} /> : null}
    {savedBudget ? <Text style={[styles.readback, { color: colors.muted }]}>Tersimpan untuk {savedBudget.period}: Rp {new Intl.NumberFormat("id-ID").format(savedBudget.productionBudget)} · target {savedBudget.productionTarget} unit.</Text> : null}
    <Text style={[styles.listLabel, { color: colors.foreground }]}>Daftar produk</Text>
  </View>;
}

function BudgetProductOption({ product, selected, onSelect, colors, compact = false }: { product: ReturnType<typeof useMitraProducts>[number]; selected: boolean; onSelect: () => void; colors: Colors; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Pilih produk ${product.name}`} onPress={onSelect} style={({ pressed }) => [styles.productOption, compact && styles.compactProductOption, { backgroundColor: colors.surface, borderColor: selected ? colors.primary : colors.border }, pressed && styles.pressed]}><View style={[styles.productIcon, compact && styles.compactProductIcon, { backgroundColor: `${colors.primary}18` }]}><AppIcon name="shippingbox" size={compact ? 18 : 21} color={colors.primary} /></View><View style={styles.productCopy}><Text style={[styles.productName, compact && styles.compactProductName, { color: colors.foreground }]}>{product.name}</Text><Text style={[styles.productMeta, { color: colors.muted }]}>{product.category} · {product.unit} · {product.size}</Text></View>{selected ? <AppIcon name="verified" size={20} color={colors.primary} /> : null}</Pressable>;
}

function ProductionCard({ production, productName, colors }: { production: ReturnType<typeof useMitraProductions>[number]; productName: string; colors: Colors }) {
  const status: ProductionStatus = production.status;
  return <View style={[styles.productionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.productionTop}><View style={styles.productionTitleCopy}><Text style={[styles.productionName, { color: colors.foreground }]}>{productName}</Text><Text style={[styles.productionDate, { color: colors.muted }]}>Tanggal produksi: {production.productionDate}</Text></View><View style={[styles.statusBadge, { backgroundColor: status === "Direncanakan" ? `${colors.warning}18` : `${colors.success}18` }]}><Text style={[styles.statusText, { color: status === "Direncanakan" ? colors.warning : colors.success }]}>{status}</Text></View></View><View style={styles.detailGrid}><Detail label="Target Produksi" value={`${production.targetQuantity} unit`} colors={colors} /><Detail label="Jumlah Produksi" value={`${production.actualQuantity ?? "-"} unit`} colors={colors} /><Detail label="Periode Anggaran" value={production.budgetPeriod} colors={colors} /><Detail label="Hasil Aktual" value={production.actualQuantity === null ? "Belum tersedia" : `${production.actualQuantity} unit`} colors={colors} /></View>{production.notes ? <Text style={[styles.notes, { color: colors.muted }]}>Catatan: {production.notes}</Text> : null}</View>;
}

function Detail({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return <View style={styles.detail}><Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text></View>;
}

function ChipRow({ values, selected, onSelect, colors }: { values: string[]; selected: string; onSelect: (value: string) => void; colors: Colors }) {
  return <View style={styles.chipRow}>{values.map((value) => <Pressable key={value} accessibilityRole="button" onPress={() => onSelect(value)} style={({ pressed }) => [styles.chip, { borderColor: selected === value ? colors.primary : colors.border, backgroundColor: selected === value ? `${colors.primary}16` : colors.background }, pressed && styles.pressed]}><Text style={[styles.chipText, { color: selected === value ? colors.primary : colors.muted }]}>{value}</Text></Pressable>)}</View>;
}

function Message({ text, colors }: { text: string; colors: Colors }) {
  return <View style={[styles.savedNote, { backgroundColor: `${colors.success}14` }]}><AppIcon name="verified" size={17} color={colors.success} /><Text style={[styles.savedText, { color: colors.success }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: 14, paddingBottom: 28 }, headerRow: { flexDirection: "row", alignItems: "flex-start" }, headerCopy: { flex: 1 }, eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 7 }, title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 }, subtitle: { fontSize: 13, lineHeight: 19, marginTop: 8, paddingRight: 12 }, headerIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 }, segment: { flexDirection: "row", borderWidth: 1, borderRadius: 13, padding: 3, marginTop: 20 }, segmentButton: { flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 10 }, segmentText: { fontSize: 12, fontWeight: "800" }, primaryAction: { minHeight: 48, borderRadius: 14, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 14 }, primaryActionText: { fontSize: 14, fontWeight: "800" }, formCard: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 14 }, formTitle: { fontSize: 18, fontWeight: "800" }, fieldLabel: { fontSize: 12, fontWeight: "800", marginTop: 16, marginBottom: 7 }, helper: { fontSize: 12, lineHeight: 18 }, optionList: { gap: 8, marginTop: 12 }, selectedCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 12 }, selectedCopy: { flex: 1 }, selectedLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 }, selectedName: { fontSize: 14, fontWeight: "800", marginTop: 5 }, selectedMeta: { fontSize: 11, marginTop: 4 }, emptySelection: { fontSize: 12, marginTop: 6 }, input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 }, notesInput: { minHeight: 76, paddingTop: 12, textAlignVertical: "top" }, readOnlyInput: { minHeight: 46, borderWidth: 1, borderRadius: 12, justifyContent: "center", paddingHorizontal: 12 }, readOnlyText: { fontSize: 13, fontWeight: "700" }, chipRow: { flexDirection: "row", gap: 8 }, chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 }, chipText: { fontSize: 12, fontWeight: "700" }, errorText: { fontSize: 12, lineHeight: 18, marginTop: 12 }, saveButton: { minHeight: 47, borderRadius: 13, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 17 }, saveText: { fontSize: 14, fontWeight: "800" }, savedNote: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 11, padding: 10, marginTop: 12 }, savedText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "700" }, readback: { fontSize: 11, lineHeight: 17, marginTop: 10 }, listLabel: { fontSize: 12, fontWeight: "800", marginTop: 18 }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 25, marginBottom: 11 }, sectionTitle: { fontSize: 18, fontWeight: "800" }, countText: { fontSize: 12, fontWeight: "700" }, productOption: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 15, padding: 12 }, compactProductOption: { padding: 10 }, productIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" }, compactProductIcon: { width: 36, height: 36, borderRadius: 11 }, productCopy: { flex: 1, marginLeft: 11 }, productName: { fontSize: 14, fontWeight: "800" }, compactProductName: { fontSize: 13 }, productMeta: { fontSize: 11, marginTop: 4 }, productionCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 10 }, productionTop: { flexDirection: "row", alignItems: "flex-start" }, productionTitleCopy: { flex: 1, paddingRight: 8 }, productionName: { fontSize: 16, fontWeight: "800" }, productionDate: { fontSize: 11, marginTop: 5 }, statusBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 }, statusText: { fontSize: 10, fontWeight: "800" }, detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 15 }, detail: { width: "47%", paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#DCE5DF" }, detailLabel: { fontSize: 10 }, detailValue: { fontSize: 13, fontWeight: "800", marginTop: 3 }, notes: { fontSize: 11, lineHeight: 17, marginTop: 12, fontStyle: "italic" }, emptyText: { textAlign: "center", fontSize: 13, lineHeight: 20, paddingVertical: 28 }, pressed: { opacity: 0.78 },
});
