import { MitraDistribution } from "@/components/mitra-distribution";
import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { formatProductPrice, useMitraProducts } from "@/lib/mitra-products";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { FlatList, StyleSheet, Text, View } from "react-native";

export default function ProductsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const isMitra = user?.role === "mitra_umkm";
  const products = useMitraProducts();

  if (isMitra) {
    return <ScreenContainer className="px-5"><View style={styles.distributionHeader}><View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG DISTRIBUSI</Text><Text style={[styles.title, { color: colors.foreground }]}>Distribusi</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Ajukan supply dan pantau pengiriman produk dari Master Produk.</Text></View><View style={[styles.headerIcon, { backgroundColor: `${colors.primary}18` }]}><AppIcon name="shippingbox" size={25} color={colors.primary} /></View></View><MitraDistribution /></ScreenContainer>;
  }

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
                <Text style={[styles.subtitle, { color: colors.muted }]}>Daftar produk yang menjadi sumber data Produksi dan HPP.</Text>
              </View>
              <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}18` }]}>
                <AppIcon name="shippingbox" size={25} color={colors.primary} />
              </View>
            </View>
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

const styles = StyleSheet.create({
  listContent: { paddingTop: 14, paddingBottom: 28 },
  distributionHeader: { flexDirection: "row", alignItems: "flex-start", paddingTop: 14 },
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 7 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 8, paddingRight: 12 },
  headerIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 2 },
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
});
