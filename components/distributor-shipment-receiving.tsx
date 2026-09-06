import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = { onSaved?: () => void };

export function DistributorShipmentReceiving({ onSaved }: Props) {
  const colors = useColors();
  const { user, isAuthenticated } = useAuth();
  const shipmentsQuery = trpc.mitraShipments.list.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "distributor",
  });
  const productsQuery = trpc.products.list.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "distributor",
  });
  const receiveMutation = trpc.distributorReceiving.receive.useMutation({
    onSuccess: () => {
      void shipmentsQuery.refetch();
      onSaved?.();
    },
  });

  if (user?.role !== "distributor") {
    return (
      <View style={[styles.container, { borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Penerimaan Distributor</Text>
        <Text style={[styles.helper, { color: colors.muted }]}>Penerimaan Shipment hanya dapat dilakukan oleh Distributor.</Text>
      </View>
    );
  }

  const shipments = shipmentsQuery.data ?? [];
  const incoming = shipments.filter((shipment) => shipment.status === "shipped");
  const received = shipments.filter((shipment) => shipment.status === "received");
  const productName = (productId: string) => productsQuery.data?.find((product) => product.id === productId)?.name ?? `Produk ${productId.slice(0, 8)}`;

  return (
    <View style={[styles.container, { borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Penerimaan Distributor</Text>
      <Text style={[styles.helper, { color: colors.muted }]}>Pilih Shipment berstatus Dikirim. Jumlah penerimaan selalu sama dengan jumlah Shipment.</Text>
      {shipmentsQuery.isError ? <Text style={[styles.error, { color: colors.error }]}>Shipment belum dapat dimuat.</Text> : null}
      {receiveMutation.isError ? <Text style={[styles.error, { color: colors.error }]}>{receiveMutation.error.message}</Text> : null}
      {incoming.length ? incoming.map((shipment) => (
        <View key={shipment.id} style={[styles.row, { borderTopColor: colors.border }]}>
          <View style={styles.copy}>
            <Text style={[styles.name, { color: colors.foreground }]}>{productName(shipment.productId)}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{shipment.quantity} unit · Shipment {shipment.shipmentDate}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={receiveMutation.isPending}
            onPress={() => receiveMutation.mutate({ shipmentId: shipment.id })}
            style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && styles.pressed, receiveMutation.isPending && styles.disabled]}
          >
            <Text style={[styles.buttonText, { color: colors.background }]}>Diterima</Text>
          </Pressable>
        </View>
      )) : <Text style={[styles.empty, { color: colors.muted }]}>Tidak ada Shipment berstatus Dikirim.</Text>}
      <Text style={[styles.historyTitle, { color: colors.foreground }]}>Riwayat Diterima</Text>
      {received.length ? received.map((shipment) => (
        <View key={shipment.id} style={[styles.row, { borderTopColor: colors.border }]}>
          <View style={styles.copy}>
            <Text style={[styles.name, { color: colors.foreground }]}>{productName(shipment.productId)}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{shipment.quantity} unit · diterima {shipment.receivedAt ? shipment.receivedAt.slice(0, 10) : "-"}</Text>
          </View>
          <Text style={[styles.received, { color: colors.success }]}>Diterima</Text>
        </View>
      )) : <Text style={[styles.empty, { color: colors.muted }]}>Belum ada riwayat penerimaan.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 19, padding: 15, marginTop: 14 },
  title: { fontSize: 19, fontWeight: "800" },
  helper: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  error: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  row: { flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11, marginTop: 10 },
  copy: { flex: 1, paddingRight: 10 },
  name: { fontSize: 13, fontWeight: "800" },
  meta: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  button: { minHeight: 38, borderRadius: 10, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 11, fontWeight: "800" },
  received: { fontSize: 10, fontWeight: "800" },
  empty: { fontSize: 12, lineHeight: 18, paddingVertical: 12 },
  historyTitle: { fontSize: 16, fontWeight: "800", marginTop: 20, marginBottom: 4 },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
});
