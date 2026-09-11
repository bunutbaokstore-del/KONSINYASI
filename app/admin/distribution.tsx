import { AdminModuleScreen } from "@/components/admin-module-screen";

export default function AdminDistributionScreen() {
  return (
    <AdminModuleScreen
      title="Distribusi"
      description="Susun struktur operasional: wilayah, rute, outlet, dan penugasan Sales Motoris."
      items={[
        { title: "Wilayah", description: "Kelola wilayah dan rute, tugaskan outlet serta Sales Motoris.", icon: "map", route: "/admin/wilayah" },
      ]}
    />
  );
}