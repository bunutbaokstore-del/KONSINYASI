import { AdminModuleScreen } from "@/components/admin-module-screen";

export default function AdminDistributionScreen() {
  return (
    <AdminModuleScreen
      title="Distribusi"
      description="Susun struktur operasional: rute, outlet, dan penugasan Sales Motoris."
      items={[
        { title: "Rute", description: "Kelola rute dan penugasan outlet/Sales.", icon: "shippingbox", route: "/admin/rute-list" },
        { title: "Outlet", description: "Kelola data toko, pemilik, lokasi, dan foto.", icon: "building", route: "/admin/outlet" },
      ]}
    />
  );
}