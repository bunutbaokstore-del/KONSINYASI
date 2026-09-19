export type WilayahRecord = {
  id: string;
  kode: string;
  nama: string;
  keterangan: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  ruteCount: number;
  outletCount: number;
  salesCount: number;
};

export type WilayahInput = {
  kode: string;
  nama: string;
  keterangan?: string | null;
};

export type RuteRecord = {
  id: string;
  wilayahId: string;
  kode: string;
  nama: string;
  keterangan: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RuteDetail = {
  wilayah: { id: string; kode: string; nama: string };
  rute: RuteRecord;
  outlets: OutletRecord[];
  sales: SalesRecord[];
  outletCount: number;
  salesCount: number;
};

export type WilayahDetailRute = RuteRecord & {
  outletCount: number;
  salesCount: number;
  outlets: OutletRecord[];
  sales: SalesRecord[];
};

export type WilayahDetail = {
  wilayah: {
    id: string;
    kode: string;
    nama: string;
    keterangan: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  rutes: WilayahDetailRute[];
};

export type OutletStatus = "ACTIVE" | "INACTIVE";

export type DayOfWeek = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

export type ProvinsiRecord = {
  id: string;
  nama: string;
};

export type KabupatenKotaRecord = {
  id: string;
  provinsiId: string;
  nama: string;
};

export type KecamatanRecord = {
  id: string;
  kabupatenKotaId: string;
  kodeBps: string | null;
  nama: string;
  isActive: boolean;
};

export type DesaRecord = {
  id: string;
  kecamatanId: string;
  kabupatenKotaId: string;
  nama: string;
  isActive: boolean;
};

export type ListKabupatenKotaInput = {
  provinsiId?: string | null;
};

export type ListKecamatanInput = {
  kabupatenKotaId: string;
};

export type ListDesaInput = {
  kecamatanId: string;
};

export type OutletVisitScheduleRecord = {
  id: string;
  distributorId: string;
  outletId: string;
  dayOfWeek: DayOfWeek;
  createdAt: string;
  updatedAt: string;
};

export type OutletRecord = {
  id: string;
  kode: string;
  nama: string;
  namaPemilik: string | null;
  noHp: string | null;
  alamat: string | null;
  alamatSingkat: string;
  latitude: number | null;
  longitude: number | null;
  fotoDepanUrl: string | null;
  status: OutletStatus;
  createdAt: string;
  updatedAt: string;
  activeRuteId: string | null;
  activeRuteNama: string | null;
  visitDays: DayOfWeek[];
  desaId: string | null;
  desaNama: string | null;
  kecamatanId: string | null;
  kecamatanNama: string | null;
  kabupatenKotaId: string | null;
  kabupatenKotaNama: string | null;
  provinsiId: string | null;
  provinsiNama: string | null;
  desaInfo?: {
    desaId: string;
    desaNama: string;
    kecamatanId: string;
    kecamatanNama: string;
    kabupatenKotaId: string;
    kabupatenKotaNama: string;
    provinsiId: string;
    provinsiNama: string;
  };
};

export type OutletInput = {
  nama: string;
  namaPemilik?: string | null;
  noHp?: string | null;
  alamat?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  fotoDepanUrl?: string | null;
  desaId?: string | null;
};

export type OutletFormValue = {
  nama: string;
  namaPemilik: string | null;
  noHp: string | null;
  alamat: string | null;
  latitude: number | null;
  longitude: number | null;
  fotoDepanUrl: string | null;
  visitDays: DayOfWeek[];
  desaId: string | null;
  kecamatanId: string | null;
  kabupatenKotaId: string | null;
};

export type SalesRecord = {
  id: string;
  nama: string;
  email: string | null;
  activeRuteId: string | null;
  activeRuteNama: string | null;
};

export type AssignmentResult = {
  assignmentId: string;
  action: "assign" | "reassign";
  previousRuteId: string | null;
  assignedAt: string;
};

export type AssignmentHistoryEntry = {
  id: string;
  entityType: "outlet" | "sales";
  entityId: string;
  entityName: string;
  fromRuteId: string | null;
  fromRuteNama: string | null;
  toRuteId: string | null;
  toRuteNama: string | null;
  action: "assign" | "reassign" | "unassign";
  changedBy: string;
  changedByName: string;
  changedAt: string;
};

export type AssignmentHistoryFilter = {
  entityType?: "outlet" | "sales";
  entityId?: string;
  ruteId?: string;
  limit?: number;
};