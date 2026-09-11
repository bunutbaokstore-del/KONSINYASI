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

export type OutletRecord = {
  id: string;
  kode: string;
  nama: string;
  alamat: string;
  alamatSingkat: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  activeRuteId: string | null;
  activeRuteNama: string | null;
};

export type OutletInput = {
  kode: string;
  nama: string;
  alamat: string;
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