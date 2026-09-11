import { AdminModuleScreen } from "@/components/admin-module-screen";

export default function AdminOperationalScreen() {
  return (
    <AdminModuleScreen
      title="Operasional"
      description="Kelola ruang kerja operasional tenant dari satu tempat."
      items={[
        { title: "Persetujuan", description: "Tinjau dan putuskan pengajuan Mitra UMKM.", icon: "send", route: "/supplier-requests" },
        { title: "Katalog Produk", description: "Atur barang dan stok Mitra UMKM.", icon: "inventory", route: "/admin/products" },
        { title: "Daftar Mitra UMKM", description: "Lihat daftar Mitra UMKM dalam ruang kerja tenant.", icon: "group", route: "/mitra-users" },
        { title: "Wilayah", description: "Kelola wilayah, rute, outlet, dan penugasan Sales.", icon: "building", route: "/admin/wilayah" },
        { title: "Alokasi Muatan", description: "Alokasi muatan belum memiliki backend.", icon: "shippingbox" },
      ]}
    />
  );
}
