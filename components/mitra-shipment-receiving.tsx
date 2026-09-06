import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useMitraProducts } from "@/lib/mitra-products";
import { StyleSheet, Text, View } from "react-native";

const STATUS_LABELS: Record<string, string> = {
  planned: "Direncanakan",
  shipped: "Dikirim",
  received: "Diterima",
};

export function MitraShipmentReceiving(_props: { onSaved?: () => void }) {
  const colors = useColors();
  const products = useMitraProducts();
  const shipmentsQuery = trpc.mitraShipments.list.useQuery();
  const shipments = shipmentsQuery.data ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Riwayat Pengiriman</Text>
      <Text style={[styles.helper, { color: colors.muted }]}>Status penerimaan diperbarui oleh Distributor. Mitra hanya dapat melihat riwayat shipment persistent.</Text>
      {shipmentsQuery.isLoading ? <Text style={[styles.state, { color: colors.muted }]}>Memuat riwayat pengiriman...</Text> : null}
      {shipmentsQuery.isError ? <Text style={[styles.error, { color: colors.error }]}>Riwayat pengiriman belum dapat dimuat. Coba lagi nanti.</Text> : null}
      {!shipmentsQuery.isLoading && !shipmentsQuery.isError && !shipments.length ? <Text style={[styles.empty, { color: colors.muted }]}>Belum ada riwayat pengiriman.</Text> : null}
      {!shipmentsQuery.isLoading && !shipmentsQuery.isError ? shipments.map((shipment) => {
        const productName = products.find((product) => product.id === shipment.productId)?.name ?? "Produk tidak ditemukan";
        const statusLabel = STATUS_LABELS[shipment.status] ?? shipment.status;
        return <View key={shipment.id} style={[styles.historyRow, { borderTopColor: colors.border }]}>
          <View style={styles.copy}>
            <Text style={[styles.name, { color: colors.foreground }]}>{productName}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{shipment.quantity} unit · dikirim {shipment.shipmentDate}</Text>
            {shipment.notes ? <Text style={[styles.meta, { color: colors.muted }]}>{shipment.notes}</Text> : null}
            {shipment.receivedAt ? <Text style={[styles.meta, { color: colors.muted }]}>Diterima {shipment.receivedAt}</Text> : null}
            {shipment.receivedNotes ? <Text style={[styles.meta, { color: colors.muted }]}>{shipment.receivedNotes}</Text> : null}
          </View>
          <Text style={[styles.status, { color: shipment.status === "received" ? colors.success : colors.primary }]}>{statusLabel}</Text>
        </View>;
      }) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 14 },
  title: { fontSize: 19, fontWeight: "800" },
  helper: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  state: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  error: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  empty: { fontSize: 12, lineHeight: 18, paddingVertical: 12 },
  copy: { flex: 1 },
  name: { fontSize: 13, fontWeight: "800" },
  meta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  status: { fontSize: 10, fontWeight: "800", marginLeft: 8 },
  historyRow: { flexDirection: "row", alignItems: "flex-start", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11, marginTop: 5 },
});
