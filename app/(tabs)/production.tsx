import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { formatProductPrice, useMitraProducts } from "@/lib/mitra-products";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

export default function ProductionScreen() {
  const colors = useColors();
  const products = useMitraProducts();
  const [isHppOpen, setHppOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;

  return (
    <ScreenContainer className="px-5">
      <FlatList
        data={isHppOpen ? products : []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View style={styles.headerCopy}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG PRODUKSI</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>Produksi</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Siapkan produksi dan gunakan produk dari Master Produk.</Text>
              </View>
              <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}18` }]}>
                <AppIcon name="building" size={25} color={colors.primary} />
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setHppOpen((open) => !open)} style={({ pressed }) => [styles.hppCard, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
              <View style={[styles.hppIcon, { backgroundColor: `${colors.background}25` }]}><AppIcon name="wallet" size={23} color={colors.background} /></View>
              <View style={styles.hppCopy}>
                <Text style={[styles.hppTitle, { color: colors.background }]}>HPP Produksi</Text>
                <Text style={[styles.hppSubtitle, { color: "#D9EFE5" }]}>{isHppOpen ? "Pilih produk dari Master Produk" : "Hitung biaya produksi per produk"}</Text>
              </View>
              <AppIcon name={isHppOpen ? "chevron-left" : "chevron-right"} size={21} color={colors.background} />
            </Pressable>
            {isHppOpen ? (
              <View style={[styles.selectorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.selectorTitle, { color: colors.foreground }]}>Pilih Produk</Text>
                <Text style={[styles.selectorSubtitle, { color: colors.muted }]}>Pilihan ini memakai sumber data Master Produk yang sama.</Text>
                {products.length === 0 ? <Text style={[styles.emptyText, { color: colors.muted }]}>Belum ada produk. Tambahkan produk dari menu Produk.</Text> : null}
                {selectedProduct ? (
                  <View style={[styles.selectedCard, { backgroundColor: `${colors.primary}12`, borderColor: colors.primary }]}>
                    <View style={styles.selectedCopy}>
                      <Text style={[styles.selectedLabel, { color: colors.primary }]}>PRODUK TERPILIH</Text>
                      <Text style={[styles.selectedName, { color: colors.foreground }]}>{selectedProduct.name}</Text>
                      <Text style={[styles.selectedMeta, { color: colors.muted }]}>{selectedProduct.category} · {selectedProduct.size} · {formatProductPrice(selectedProduct.sellingPrice)}</Text>
                    </View>
                    <AppIcon name="verified" size={23} color={colors.primary} />
                  </View>
                ) : null}
                <Text style={[styles.listLabel, { color: colors.foreground }]}>Daftar produk</Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = item.id === selectedProductId;
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`Pilih produk ${item.name}`} onPress={() => setSelectedProductId(item.id)} style={({ pressed }) => [styles.productOption, { backgroundColor: colors.surface, borderColor: isSelected ? colors.primary : colors.border }, pressed && styles.pressed]}>
              <View style={[styles.productIcon, { backgroundColor: `${colors.primary}18` }]}><AppIcon name="shippingbox" size={21} color={colors.primary} /></View>
              <View style={styles.productCopy}>
                <Text style={[styles.productName, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.productMeta, { color: colors.muted }]}>{item.category} · {item.unit} · {item.size}</Text>
              </View>
              {isSelected ? <AppIcon name="verified" size={21} color={colors.primary} /> : null}
            </Pressable>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 14, paddingBottom: 28 },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 7 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 8, paddingRight: 12 },
  headerIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
  hppCard: { flexDirection: "row", alignItems: "center", borderRadius: 19, padding: 15, marginTop: 22 },
  hppIcon: { width: 45, height: 45, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  hppCopy: { flex: 1, marginLeft: 12 },
  hppTitle: { fontSize: 16, fontWeight: "800" },
  hppSubtitle: { fontSize: 12, marginTop: 4 },
  selectorCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 14, marginBottom: 10 },
  selectorTitle: { fontSize: 17, fontWeight: "800" },
  selectorSubtitle: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  selectedCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 14 },
  selectedCopy: { flex: 1 },
  selectedLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  selectedName: { fontSize: 14, fontWeight: "800", marginTop: 5 },
  selectedMeta: { fontSize: 11, marginTop: 4 },
  listLabel: { fontSize: 12, fontWeight: "800", marginTop: 16 },
  productOption: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 9 },
  productIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  productCopy: { flex: 1, marginLeft: 11 },
  productName: { fontSize: 14, fontWeight: "800" },
  productMeta: { fontSize: 11, marginTop: 4 },
  emptyText: { fontSize: 12, lineHeight: 18, marginTop: 15 },
  pressed: { opacity: 0.78 },
});
