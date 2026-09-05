import { AdminModuleScreen } from "@/components/admin-module-screen";

export default function AdminOperationalScreen() {
  return (
    <AdminModuleScreen
      title="Operasional"
      description="Kelola ruang kerja operasional tenant dari satu tempat."
      items={[
        { title: "Katalog Produk", description: "Atur barang dan stok Mitra UMKM.", icon: "inventory", route: "/manage-inventory" },
        { title: "Daftar Mitra UMKM", description: "Lihat daftar Mitra UMKM dalam ruang kerja tenant.", icon: "group", route: "/mitra-users" },
        { title: "Wilayah", description: "Struktur wilayah operasional belum tersedia.", icon: "building" },
        { title: "Alokasi Muatan", description: "Alokasi muatan belum memiliki backend.", icon: "shippingbox" },
      ]}
    />
  );
}
