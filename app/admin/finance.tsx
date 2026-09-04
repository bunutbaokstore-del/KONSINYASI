import { AdminModuleScreen } from "@/components/admin-module-screen";

export default function AdminFinanceScreen() {
  return (
    <AdminModuleScreen
      title="Keuangan"
      description="Akses ringkasan finansial tenant tanpa membuat data tiruan."
      items={[
        { title: "Laporan Laba & Penjualan", description: "Laporan laba dan penjualan belum tersedia.", icon: "wallet" },
        { title: "Split Billing Ledger", description: "Ledger split billing belum memiliki backend.", icon: "verified" },
        { title: "Stok Gudang Harian", description: "Stok gudang harian belum tersedia.", icon: "inventory" },
      ]}
    />
  );
}
