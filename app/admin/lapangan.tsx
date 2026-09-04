import { AdminModuleScreen } from "@/components/admin-module-screen";

export default function AdminFieldScreen() {
  return (
    <AdminModuleScreen
      title="Lapangan"
      description="Pantau aktivitas lapangan tenant saat modul backend tersedia."
      items={[
        { title: "Monitor Absensi", description: "Monitor absensi belum memiliki backend.", icon: "person" },
        { title: "Aktivitas", description: "Feed aktivitas lapangan belum tersedia.", icon: "notifications" },
        { title: "Transaksi", description: "Transaksi lapangan belum memiliki backend.", icon: "cart" },
        { title: "Jaringan Toko", description: "Jaringan toko belum tersedia.", icon: "group" },
      ]}
    />
  );
}
