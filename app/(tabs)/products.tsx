import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { addMitraProduct, formatProductPrice, type ProductStatus, useMitraProducts } from "@/lib/mitra-products";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const CATEGORIES = ["Makanan", "Minuman", "Kerajinan", "Lainnya"];
const UNITS = ["Pcs", "Gram", "Kilogram", "Pouch"];

export default function ProductsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const isMitra = user?.role === "mitra_umkm";
  const products = useMitraProducts();
  const [isFormVisible, setFormVisible] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [unit, setUnit] = useState(UNITS[0]);
  const [size, setSize] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [status, setStatus] = useState<ProductStatus>("Aktif");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setCategory(CATEGORIES[0]);
    setUnit(UNITS[0]);
    setSize("");
    setSellingPrice("");
    setStatus("Aktif");
    setError(null);
  };

  const handleSave = () => {
    if (isMitra) return;
    const parsedPrice = Number(sellingPrice.replace(/[^0-9]/g, ""));
    if (!name.trim() || !size.trim() || !sellingPrice.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Lengkapi data produk dan masukkan harga jual yang valid.");
      return;
    }

    addMitraProduct({
      name: name.trim(),
      category,
      unit,
      size: size.trim(),
      sellingPrice: parsedPrice,
      status,
    });
    resetForm();
    setFormVisible(false);
  };

  return (
    <ScreenContainer className="px-5">
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>MASTER DATA MITRA</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>Produk</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>{isMitra ? "Lihat produk yang tersedia untuk Produksi dan HPP." : "Kelola produk yang menjadi sumber data Produksi dan HPP."}</Text>
              </View>
              <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}18` }]}>
                <AppIcon name="shippingbox" size={25} color={colors.primary} />
              </View>
            </View>
            {!isMitra ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isFormVisible ? "Tutup form tambah produk" : "Tambah produk baru"}
                  onPress={() => {
                    setFormVisible((visible) => !visible);
                    setError(null);
                  }}
                  style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}
                >
                  <AppIcon name={isFormVisible ? "close" : "add"} size={20} color={colors.background} />
                  <Text style={[styles.addButtonText, { color: colors.background }]}>{isFormVisible ? "Tutup Form" : "Tambah Produk"}</Text>
                </Pressable>
                {isFormVisible ? (
              <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.formTitle, { color: colors.foreground }]}>Tambah Produk</Text>
                <FieldLabel text="Nama Produk" colors={colors} />
                <TextInput value={name} onChangeText={setName} placeholder="Contoh: Sambal Ijo" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} returnKeyType="next" />
                <FieldLabel text="Kategori" colors={colors} />
                <ChipRow values={CATEGORIES} selected={category} onSelect={setCategory} colors={colors} />
                <FieldLabel text="Satuan" colors={colors} />
                <ChipRow values={UNITS} selected={unit} onSelect={setUnit} colors={colors} />
                <FieldLabel text="Ukuran/Berat" colors={colors} />
                <TextInput value={size} onChangeText={setSize} placeholder="Contoh: 250 g" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} returnKeyType="next" />
                <FieldLabel text="Harga Jual" colors={colors} />
                <TextInput value={sellingPrice} onChangeText={setSellingPrice} placeholder="Contoh: 45000" placeholderTextColor={colors.muted} keyboardType="numeric" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} returnKeyType="done" />
                <FieldLabel text="Status Produk" colors={colors} />
                <ChipRow values={["Aktif", "Nonaktif"]} selected={status} onSelect={(value) => setStatus(value as ProductStatus)} colors={colors} />
                {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
                <Pressable accessibilityRole="button" onPress={handleSave} style={({ pressed }) => [styles.saveButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                  <Text style={[styles.saveButtonText, { color: colors.background }]}>Simpan Produk</Text>
                </Pressable>
              </View>
                ) : null}
              </>
            ) : null}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daftar Produk</Text>
              <Text style={[styles.countText, { color: colors.muted }]}>{products.length} produk</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.productCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.productIcon, { backgroundColor: `${colors.primary}18` }]}><AppIcon name="shippingbox" size={22} color={colors.primary} /></View>
            <View style={styles.productCopy}>
              <Text style={[styles.productName, { color: colors.foreground }]}>{item.name}</Text>
              <Text style={[styles.productMeta, { color: colors.muted }]}>{item.category} · {item.unit} · {item.size}</Text>
              <Text style={[styles.productPrice, { color: colors.primary }]}>{formatProductPrice(item.sellingPrice)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: item.status === "Aktif" ? `${colors.success}18` : `${colors.muted}18` }]}>
              <Text style={[styles.statusText, { color: item.status === "Aktif" ? colors.success : colors.muted }]}>{item.status}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.muted }]}>Belum ada produk.</Text>}
      />
    </ScreenContainer>
  );
}

function FieldLabel({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{text}</Text>;
}

function ChipRow({ values, selected, onSelect, colors }: { values: string[]; selected: string; onSelect: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.chipRow}>
      {values.map((value) => (
        <Pressable key={value} accessibilityRole="button" onPress={() => onSelect(value)} style={({ pressed }) => [styles.chip, { borderColor: selected === value ? colors.primary : colors.border, backgroundColor: selected === value ? `${colors.primary}16` : colors.background }, pressed && styles.pressed]}>
          <Text style={[styles.chipText, { color: selected === value ? colors.primary : colors.muted }]}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: 14, paddingBottom: 28 },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 7 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 8, paddingRight: 12 },
  headerIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
  addButton: { minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 },
  addButtonText: { fontSize: 14, fontWeight: "800" },
  formCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 16 },
  formTitle: { fontSize: 18, fontWeight: "800", marginBottom: 2 },
  fieldLabel: { fontSize: 12, fontWeight: "800", marginTop: 15, marginBottom: 7 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  chipText: { fontSize: 12, fontWeight: "700" },
  errorText: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  saveButton: { minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 16 },
  saveButtonText: { fontSize: 14, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 11 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  countText: { fontSize: 12, fontWeight: "700" },
  productCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 17, padding: 13, marginBottom: 10 },
  productIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  productCopy: { flex: 1, marginLeft: 12, paddingRight: 7 },
  productName: { fontSize: 15, fontWeight: "800" },
  productMeta: { fontSize: 11, marginTop: 4 },
  productPrice: { fontSize: 13, fontWeight: "800", marginTop: 7 },
  statusBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6, alignSelf: "flex-start" },
  statusText: { fontSize: 10, fontWeight: "800" },
  emptyText: { textAlign: "center", paddingVertical: 24, fontSize: 13 },
  pressed: { opacity: 0.78 },
});
