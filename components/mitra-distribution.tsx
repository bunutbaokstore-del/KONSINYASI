import { MitraProductShipment } from "@/components/mitra-product-shipment";
import { MitraShipmentReceiving } from "@/components/mitra-shipment-receiving";
import { MitraProductRequest } from "@/components/mitra-product-request";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { saveMitraSupplyRequest, useMitraSupplyRequests, type SupplyRequestStatus } from "@/lib/mitra-supply-requests";
import { useMitraProducts } from "@/lib/mitra-products";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type DistributionView = "supply" | "shipment" | "receiving" | "history" | "products";
const MENUS: { key: DistributionView; label: string; icon: "send" | "shippingbox" | "inventory" | "verified" }[] = [
  { key: "supply", label: "Ajukan Supply", icon: "send" },
  { key: "shipment", label: "Pengiriman", icon: "shippingbox" },
  { key: "receiving", label: "Penerimaan", icon: "inventory" },
  { key: "history", label: "Riwayat Distribusi", icon: "verified" },
  { key: "products", label: "Produk", icon: "inventory" },
];

export function MitraDistribution() {
  const colors = useColors();
  const products = useMitraProducts();
  const requests = useMitraSupplyRequests();
  const [view, setView] = useState<DistributionView>("supply");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selectView = (next: DistributionView) => { setView(next); setError(null); setMessage(null); };
  const handleSave = () => {
    try {
      saveMitraSupplyRequest({ productId, quantity: Number(quantity.replace(/[^0-9]/g, "")), note }, products);
      setQuantity(""); setNote(""); setError(null); setMessage("Pengajuan Supply berhasil dikirim dan menunggu persetujuan Admin Distributor.");
    } catch (caught) { setMessage(null); setError(caught instanceof Error ? caught.message : "Pengajuan tidak dapat disimpan."); }
  };
  return <View style={styles.root}>
    <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuContent}><View style={styles.menuRow}>{MENUS.map((menu) => <Pressable key={menu.key} accessibilityRole="button" onPress={() => selectView(menu.key)} style={[styles.menuButton, { backgroundColor: view === menu.key ? `${colors.primary}14` : "transparent", borderColor: view === menu.key ? colors.primary : "transparent" }]}><AppIcon name={menu.icon} size={18} color={view === menu.key ? colors.primary : colors.muted} /><Text style={[styles.menuText, { color: view === menu.key ? colors.primary : colors.muted }]}>{menu.label}</Text></Pressable>)}</View></ScrollView></View>
    {view === "products" ? <MitraProductRequest /> : view === "supply" ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.title, { color: colors.foreground }]}>Ajukan Supply</Text><Text style={[styles.helper, { color: colors.muted }]}>Ajukan kebutuhan produk kepada Admin Distributor. Pengajuan tidak mengurangi stok.</Text><Text style={[styles.label, { color: colors.foreground }]}>Pilih Produk</Text><View style={styles.chips}>{products.map((product) => <Pressable key={product.id} accessibilityRole="button" onPress={() => setProductId(product.id)} style={[styles.chip, { borderColor: product.id === productId ? colors.primary : colors.border, backgroundColor: product.id === productId ? `${colors.primary}14` : colors.background }]}><Text style={[styles.chipText, { color: product.id === productId ? colors.primary : colors.muted }]}>{product.name}</Text></Pressable>)}</View><Text style={[styles.label, { color: colors.foreground }]}>Jumlah Supply</Text><TextInput value={quantity} onChangeText={(value) => setQuantity(value.replace(/[^0-9]/g, ""))} placeholder="Contoh: 100" placeholderTextColor={colors.muted} keyboardType="number-pad" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} /><Text style={[styles.label, { color: colors.foreground }]}>Catatan</Text><TextInput value={note} onChangeText={setNote} placeholder="Catatan untuk Admin (opsional)" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.notes, { color: colors.foreground, borderColor: colors.border }]} />{error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}<Pressable accessibilityRole="button" onPress={handleSave} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.buttonText, { color: colors.background }]}>Ajukan Supply</Text></Pressable>{message ? <Text style={[styles.message, { color: colors.success }]}>{message}</Text> : null}</View> : view === "shipment" ? <MitraProductShipment onSaved={() => selectView("history")} /> : view === "receiving" ? <MitraShipmentReceiving onSaved={() => selectView("history")} /> : <DistributionHistory requests={requests} products={products} colors={colors} />}
  </View>;
}
function DistributionHistory({ requests, products, colors }: { requests: ReturnType<typeof useMitraSupplyRequests>; products: ReturnType<typeof useMitraProducts>; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.title, { color: colors.foreground }]}>Riwayat Distribusi</Text><Text style={[styles.helper, { color: colors.muted }]}>Pantau pengajuan supply dan status distribusi.</Text>{requests.length ? requests.map((request) => <View key={request.id} style={[styles.historyRow, { borderTopColor: colors.border }]}><View style={styles.copy}><Text style={[styles.name, { color: colors.foreground }]}>{products.find((product) => product.id === request.productId)?.name ?? "Produk tidak ditemukan"}</Text><Text style={[styles.meta, { color: colors.muted }]}>{request.quantity} unit · {new Date(request.createdAt).toLocaleDateString("id-ID")}</Text></View><StatusBadge status={request.status} colors={colors} /></View>) : <Text style={[styles.empty, { color: colors.muted }]}>Belum ada riwayat distribusi.</Text>}</View>;
}
function StatusBadge({ status, colors }: { status: SupplyRequestStatus; colors: ReturnType<typeof useColors> }) { const color = status === "Disetujui" ? colors.success : status === "Ditolak" ? colors.error : colors.warning; return <Text style={[styles.status, { color }]}>{status}</Text>; }
const styles = StyleSheet.create({ root: { flex: 1 }, menu: { borderWidth: 1, borderRadius: 15, padding: 5, marginTop: 20 }, menuContent: { paddingRight: 5 }, menuRow: { flexDirection: "row", gap: 5 }, menuButton: { minWidth: 126, flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }, menuText: { fontSize: 12, fontWeight: "800" }, card: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 14 }, title: { fontSize: 19, fontWeight: "800" }, helper: { fontSize: 12, lineHeight: 18, marginTop: 5 }, label: { fontSize: 12, fontWeight: "800", marginTop: 16, marginBottom: 7 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8 }, chipText: { fontSize: 11, fontWeight: "700" }, input: { minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 14 }, notes: { minHeight: 72, paddingTop: 11, textAlignVertical: "top" }, error: { fontSize: 12, lineHeight: 18, marginTop: 12 }, button: { minHeight: 47, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 17 }, buttonText: { fontSize: 14, fontWeight: "800" }, message: { fontSize: 12, fontWeight: "700", marginTop: 11 }, historyRow: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 12, marginTop: 7 }, copy: { flex: 1 }, name: { fontSize: 13, fontWeight: "800" }, meta: { fontSize: 10, marginTop: 3 }, status: { fontSize: 10, fontWeight: "800" }, empty: { fontSize: 12, paddingVertical: 18 }, pressed: { opacity: 0.78 } });
