import { SysAdminRouteGuard } from "@/components/sysadmin-route-guard";
import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { Pressable, StyleSheet, Text, View, ActivityIndicator, FlatList, Modal, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useState, useCallback } from "react";

type Level = "provinsi" | "kabupaten_kota" | "kecamatan" | "desa";

type FilterStatus = "active" | "inactive" | "all";

type Provinsi = {
  id: string;
  nama: string;
  isActive: boolean;
};

type KabupatenKota = {
  id: string;
  provinsiId: string;
  nama: string;
  isActive: boolean;
};

type Kecamatan = {
  id: string;
  kabupatenKotaId: string;
  nama: string;
  isActive: boolean;
  kodeBps: string | null;
};

type Desa = {
  id: string;
  kecamatanId: string;
  kabupatenKotaId: string;
  nama: string;
  isActive: boolean;
};

type KabupatenKotaType = "KABUPATEN" | "KOTA";

export default function AdminSysGeographyScreen() {
  const colors = useColors();
  const router = useRouter();

  const [currentLevel, setCurrentLevel] = useState<Level>("provinsi");
  const [selectedProvinsi, setSelectedProvinsi] = useState<Provinsi | null>(null);
  const [selectedKabupatenKota, setSelectedKabupatenKota] = useState<KabupatenKota | null>(null);
  const [selectedKecamatan, setSelectedKecamatan] = useState<Kecamatan | null>(null);

  // Filter state
  const [provinsiFilter, setProvinsiFilter] = useState<FilterStatus>("active");
  const [kabupatenKotaFilter, setKabupatenKotaFilter] = useState<FilterStatus>("active");
  const [kecamatanFilter, setKecamatanFilter] = useState<FilterStatus>("active");
  const [desaFilter, setDesaFilter] = useState<FilterStatus>("active");

  // Queries
  const utils = trpc.useUtils();
  const provinsiQuery = trpc.distribution.listProvinsi.useQuery(
    { filter: provinsiFilter },
  );
  const kabupatenKotaQuery = trpc.distribution.listKabupatenKota.useQuery(
    { provinsiId: selectedProvinsi?.id ?? null, filter: kabupatenKotaFilter },
    { enabled: currentLevel === "kabupaten_kota" && Boolean(selectedProvinsi?.id) }
  );
  const kecamatanQuery = trpc.distribution.listKecamatan.useQuery(
    { kabupatenKotaId: selectedKabupatenKota?.id ?? "", filter: kecamatanFilter },
    { enabled: currentLevel === "kecamatan" && Boolean(selectedKabupatenKota?.id) }
  );
  const desaQuery = trpc.distribution.listDesa.useQuery(
    { kecamatanId: selectedKecamatan?.id ?? "", filter: desaFilter },
    { enabled: currentLevel === "desa" && Boolean(selectedKecamatan?.id) }
  );

  // Create Provinsi Mutation
  const createProvinsiMutation = trpc.platform.geography.createProvinsi.useMutation({
    onSuccess: () => {
      void utils.distribution.listProvinsi.invalidate();
      setShowCreateProvinsiModal(false);
      setProvinsiName("");
    },
    onError: (error) => {
      setCreateError(mapError(error));
    },
  });

  // Create Kabupaten/Kota Mutation
  const createKabupatenKotaMutation = trpc.platform.geography.createKabupatenKota.useMutation({
    onSuccess: () => {
      void utils.distribution.listKabupatenKota.invalidate();
      setShowCreateKabupatenKotaModal(false);
      setKabupatenKotaName("");
      setKabupatenKotaType("KABUPATEN");
    },
    onError: (error) => {
      setCreateKabupatenKotaError(mapError(error));
    },
  });

  // Create Kecamatan Mutation
  const createKecamatanMutation = trpc.platform.geography.createKecamatan.useMutation({
    onSuccess: () => {
      void utils.distribution.listKecamatan.invalidate();
      setShowCreateKecamatanModal(false);
      setKecamatanName("");
    },
    onError: (error) => {
      setCreateKecamatanError(mapError(error));
    },
  });

  // Create Desa Mutation
  const createDesaMutation = trpc.platform.geography.createDesa.useMutation({
    onSuccess: () => {
      void utils.distribution.listDesa.invalidate();
      setShowCreateDesaModal(false);
      setDesaName("");
      setDesaKodePos("");
    },
    onError: (error) => {
      setCreateDesaError(mapError(error));
    },
  });

  // Update Provinsi Mutation
  const updateProvinsiMutation = trpc.platform.geography.updateProvinsi.useMutation({
    onSuccess: () => {
      void utils.distribution.listProvinsi.invalidate();
      setShowEditProvinsiModal(false);
      setEditProvinsiName("");
      setEditProvinsiError(null);
    },
    onError: (error) => {
      setEditProvinsiError(mapError(error));
    },
  });

  // Update Kabupaten/Kota Mutation
  const updateKabupatenKotaMutation = trpc.platform.geography.updateKabupatenKota.useMutation({
    onSuccess: () => {
      void utils.distribution.listKabupatenKota.invalidate();
      setShowEditKabupatenKotaModal(false);
      setEditKabupatenKotaName("");
      setEditKabupatenKotaType("KABUPATEN");
      setEditKabupatenKotaError(null);
    },
    onError: (error) => {
      setEditKabupatenKotaError(mapError(error));
    },
  });

  // Update Kecamatan Mutation
  const updateKecamatanMutation = trpc.platform.geography.updateKecamatan.useMutation({
    onSuccess: () => {
      void utils.distribution.listKecamatan.invalidate();
      setShowEditKecamatanModal(false);
      setEditKecamatanName("");
      setEditKecamatanError(null);
    },
    onError: (error) => {
      setEditKecamatanError(mapError(error));
    },
  });

  // Update Desa Mutation
  const updateDesaMutation = trpc.platform.geography.updateDesa.useMutation({
    onSuccess: () => {
      void utils.distribution.listDesa.invalidate();
      setShowEditDesaModal(false);
      setEditDesaName("");
      setEditDesaKodePos("");
      setEditDesaError(null);
    },
    onError: (error) => {
      setEditDesaError(mapError(error));
    },
  });

  // Set Active Mutations
  const setProvinsiActiveMutation = trpc.platform.geography.setProvinsiActive.useMutation({
    onSuccess: () => {
      void utils.distribution.listProvinsi.invalidate();
    },
    onError: (error) => {
      Alert.alert("Gagal", mapError(error));
    },
  });

  const setKabupatenKotaActiveMutation = trpc.platform.geography.setKabupatenKotaActive.useMutation({
    onSuccess: () => {
      void utils.distribution.listKabupatenKota.invalidate();
    },
    onError: (error) => {
      Alert.alert("Gagal", mapError(error));
    },
  });

  const setKecamatanActiveMutation = trpc.platform.geography.setKecamatanActive.useMutation({
    onSuccess: () => {
      void utils.distribution.listKecamatan.invalidate();
    },
    onError: (error) => {
      Alert.alert("Gagal", mapError(error));
    },
  });

  const setDesaActiveMutation = trpc.platform.geography.setDesaActive.useMutation({
    onSuccess: () => {
      void utils.distribution.listDesa.invalidate();
    },
    onError: (error) => {
      Alert.alert("Gagal", mapError(error));
    },
  });

  // Delete Mutations
  const deleteProvinsiMutation = trpc.platform.geography.deleteProvinsi.useMutation({
    onSuccess: () => {
      void utils.distribution.listProvinsi.invalidate();
    },
    onError: (error) => {
      Alert.alert("Gagal", mapError(error));
    },
  });

  const deleteKabupatenKotaMutation = trpc.platform.geography.deleteKabupatenKota.useMutation({
    onSuccess: () => {
      void utils.distribution.listKabupatenKota.invalidate();
    },
    onError: (error) => {
      Alert.alert("Gagal", mapError(error));
    },
  });

  const deleteKecamatanMutation = trpc.platform.geography.deleteKecamatan.useMutation({
    onSuccess: () => {
      void utils.distribution.listKecamatan.invalidate();
    },
    onError: (error) => {
      Alert.alert("Gagal", mapError(error));
    },
  });

  const deleteDesaMutation = trpc.platform.geography.deleteDesa.useMutation({
    onSuccess: () => {
      void utils.distribution.listDesa.invalidate();
    },
    onError: (error) => {
      Alert.alert("Gagal", mapError(error));
    },
  });

  // Create Provinsi Modal State
  const [showCreateProvinsiModal, setShowCreateProvinsiModal] = useState(false);
  const [provinsiName, setProvinsiName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Create Kabupaten/Kota Modal State
  const [showCreateKabupatenKotaModal, setShowCreateKabupatenKotaModal] = useState(false);
  const [kabupatenKotaName, setKabupatenKotaName] = useState("");
  const [kabupatenKotaType, setKabupatenKotaType] = useState<KabupatenKotaType>("KABUPATEN");
  const [createKabupatenKotaError, setCreateKabupatenKotaError] = useState<string | null>(null);

  // Create Kecamatan Modal State
  const [showCreateKecamatanModal, setShowCreateKecamatanModal] = useState(false);
  const [kecamatanName, setKecamatanName] = useState("");
  const [createKecamatanError, setCreateKecamatanError] = useState<string | null>(null);

  // Create Desa Modal State
  const [showCreateDesaModal, setShowCreateDesaModal] = useState(false);
  const [desaName, setDesaName] = useState("");
  const [desaKodePos, setDesaKodePos] = useState("");
  const [createDesaError, setCreateDesaError] = useState<string | null>(null);

  // Edit Provinsi Modal State
  const [showEditProvinsiModal, setShowEditProvinsiModal] = useState(false);
  const [editProvinsiId, setEditProvinsiId] = useState<string | null>(null);
  const [editProvinsiName, setEditProvinsiName] = useState("");
  const [editProvinsiError, setEditProvinsiError] = useState<string | null>(null);

  // Edit Kabupaten/Kota Modal State
  const [showEditKabupatenKotaModal, setShowEditKabupatenKotaModal] = useState(false);
  const [editKabupatenKotaId, setEditKabupatenKotaId] = useState<string | null>(null);
  const [editKabupatenKotaName, setEditKabupatenKotaName] = useState("");
  const [editKabupatenKotaType, setEditKabupatenKotaType] = useState<KabupatenKotaType>("KABUPATEN");
  const [editKabupatenKotaError, setEditKabupatenKotaError] = useState<string | null>(null);

  // Edit Kecamatan Modal State
  const [showEditKecamatanModal, setShowEditKecamatanModal] = useState(false);
  const [editKecamatanId, setEditKecamatanId] = useState<string | null>(null);
  const [editKecamatanName, setEditKecamatanName] = useState("");
  const [editKecamatanError, setEditKecamatanError] = useState<string | null>(null);

  // Edit Desa Modal State
  const [showEditDesaModal, setShowEditDesaModal] = useState(false);
  const [editDesaId, setEditDesaId] = useState<string | null>(null);
  const [editDesaName, setEditDesaName] = useState("");
  const [editDesaKodePos, setEditDesaKodePos] = useState("");
  const [editDesaError, setEditDesaError] = useState<string | null>(null);

  // Action Menu State

  const handleBack = useCallback(() => {
    switch (currentLevel) {
      case "desa":
        setCurrentLevel("kecamatan");
        setSelectedKecamatan(null);
        break;
      case "kecamatan":
        setCurrentLevel("kabupaten_kota");
        setSelectedKabupatenKota(null);
        break;
      case "kabupaten_kota":
        setCurrentLevel("provinsi");
        setSelectedProvinsi(null);
        break;
      case "provinsi":
        router.back();
        break;
    }
  }, [currentLevel, router]);

  const handleSelectProvinsi = useCallback((provinsi: Provinsi) => {
    setSelectedProvinsi(provinsi);
    setCurrentLevel("kabupaten_kota");
  }, []);

  const handleSelectKabupatenKota = useCallback((kabupaten: KabupatenKota) => {
    setSelectedKabupatenKota(kabupaten);
    setCurrentLevel("kecamatan");
  }, []);

  const handleSelectKecamatan = useCallback((kecamatan: Kecamatan) => {
    setSelectedKecamatan(kecamatan);
    setCurrentLevel("desa");
  }, []);

  // Error mapping helper
  const mapError = (error: { code?: string; message?: string }): string => {
    if (error.code === "42501") return "Anda tidak memiliki akses.";
    if (error.code === "22001") return "Nama tidak valid atau melebihi batas karakter.";
    if (error.code === "22003") return error.message ?? "Operasi tidak dapat dilakukan karena data terkait.";
    if (error.code === "P0002") return "Data tidak ditemukan.";
    return error.message ?? "Terjadi kesalahan. Silakan coba lagi.";
  };

  // Create Provinsi Handler
  const handleCreateProvinsi = useCallback(() => {
    const trimmed = provinsiName.trim();
    if (!trimmed) {
      setCreateError("Nama provinsi wajib diisi.");
      return;
    }
    if (trimmed.length > 120) {
      setCreateError("Nama provinsi maksimal 120 karakter.");
      return;
    }
    setCreateError(null);
    createProvinsiMutation.mutate({ nama: trimmed });
  }, [provinsiName, createProvinsiMutation]);

  // Create Kabupaten/Kota Handler
  const handleCreateKabupatenKota = useCallback(() => {
    const trimmed = kabupatenKotaName.trim();
    if (!trimmed) {
      setCreateKabupatenKotaError("Nama Kabupaten/Kota wajib diisi.");
      return;
    }
    if (trimmed.length > 120) {
      setCreateKabupatenKotaError("Nama Kabupaten/Kota maksimal 120 karakter.");
      return;
    }
    if (!kabupatenKotaType) {
      setCreateKabupatenKotaError("Tipe Kabupaten/Kota wajib dipilih.");
      return;
    }
    if (!selectedProvinsi) {
      setCreateKabupatenKotaError("Provinsi induk tidak ditemukan.");
      return;
    }
    setCreateKabupatenKotaError(null);
    createKabupatenKotaMutation.mutate({
      provinsiId: selectedProvinsi.id,
      nama: trimmed,
      tipe: kabupatenKotaType,
    });
  }, [kabupatenKotaName, kabupatenKotaType, selectedProvinsi, createKabupatenKotaMutation]);

  // Create Kecamatan Handler
  const handleCreateKecamatan = useCallback(() => {
    const trimmed = kecamatanName.trim();
    if (!trimmed) {
      setCreateKecamatanError("Nama Kecamatan wajib diisi.");
      return;
    }
    if (trimmed.length > 120) {
      setCreateKecamatanError("Nama Kecamatan maksimal 120 karakter.");
      return;
    }
    if (!selectedKabupatenKota) {
      setCreateKecamatanError("Kabupaten/Kota induk tidak ditemukan.");
      return;
    }
    setCreateKecamatanError(null);
    createKecamatanMutation.mutate({
      kabupatenKotaId: selectedKabupatenKota.id,
      nama: trimmed,
    });
  }, [kecamatanName, selectedKabupatenKota, createKecamatanMutation]);

  // Create Desa Handler
  const handleCreateDesa = useCallback(() => {
    const trimmedNama = desaName.trim();
    if (!trimmedNama) {
      setCreateDesaError("Nama Desa/Kelurahan wajib diisi.");
      return;
    }
    if (trimmedNama.length > 120) {
      setCreateDesaError("Nama Desa/Kelurahan maksimal 120 karakter.");
      return;
    }
    if (!selectedKecamatan) {
      setCreateDesaError("Kecamatan induk tidak ditemukan.");
      return;
    }
    if (!selectedKabupatenKota) {
      setCreateDesaError("Kabupaten/Kota induk tidak ditemukan.");
      return;
    }
    const trimmedKodePos = desaKodePos.trim();
    setCreateDesaError(null);
    createDesaMutation.mutate({
      kabupatenKotaId: selectedKabupatenKota.id,
      kecamatanId: selectedKecamatan.id,
      nama: trimmedNama,
      kodePos: trimmedKodePos || undefined,
    });
  }, [desaName, desaKodePos, selectedKecamatan, selectedKabupatenKota, createDesaMutation]);

  // Edit Provinsi Handler
  const handleEditProvinsi = useCallback(() => {
    const trimmed = editProvinsiName.trim();
    if (!trimmed) {
      setEditProvinsiError("Nama provinsi wajib diisi.");
      return;
    }
    if (trimmed.length > 120) {
      setEditProvinsiError("Nama provinsi maksimal 120 karakter.");
      return;
    }
    if (!editProvinsiId) return;
    setEditProvinsiError(null);
    updateProvinsiMutation.mutate({ id: editProvinsiId, nama: trimmed });
  }, [editProvinsiId, editProvinsiName, updateProvinsiMutation]);

  // Edit Kabupaten/Kota Handler
  const handleEditKabupatenKota = useCallback(() => {
    const trimmed = editKabupatenKotaName.trim();
    if (!trimmed) {
      setEditKabupatenKotaError("Nama Kabupaten/Kota wajib diisi.");
      return;
    }
    if (trimmed.length > 120) {
      setEditKabupatenKotaError("Nama Kabupaten/Kota maksimal 120 karakter.");
      return;
    }
    if (!editKabupatenKotaType) {
      setEditKabupatenKotaError("Tipe Kabupaten/Kota wajib dipilih.");
      return;
    }
    if (!editKabupatenKotaId) return;
    setEditKabupatenKotaError(null);
    updateKabupatenKotaMutation.mutate({
      id: editKabupatenKotaId,
      nama: trimmed,
      tipe: editKabupatenKotaType,
    });
  }, [editKabupatenKotaId, editKabupatenKotaName, editKabupatenKotaType, updateKabupatenKotaMutation]);

  // Edit Kecamatan Handler
  const handleEditKecamatan = useCallback(() => {
    const trimmed = editKecamatanName.trim();
    if (!trimmed) {
      setEditKecamatanError("Nama Kecamatan wajib diisi.");
      return;
    }
    if (trimmed.length > 120) {
      setEditKecamatanError("Nama Kecamatan maksimal 120 karakter.");
      return;
    }
    if (!editKecamatanId) return;
    setEditKecamatanError(null);
    updateKecamatanMutation.mutate({ id: editKecamatanId, nama: trimmed });
  }, [editKecamatanId, editKecamatanName, updateKecamatanMutation]);

  // Edit Desa Handler
  const handleEditDesa = useCallback(() => {
    const trimmedNama = editDesaName.trim();
    if (!trimmedNama) {
      setEditDesaError("Nama Desa/Kelurahan wajib diisi.");
      return;
    }
    if (trimmedNama.length > 120) {
      setEditDesaError("Nama Desa/Kelurahan maksimal 120 karakter.");
      return;
    }
    const trimmedKodePos = editDesaKodePos.trim();
    if (!editDesaId) return;
    setEditDesaError(null);
    updateDesaMutation.mutate({
      id: editDesaId,
      nama: trimmedNama,
      kodePos: trimmedKodePos || undefined,
    });
  }, [editDesaId, editDesaName, editDesaKodePos, updateDesaMutation]);

  // Set Active Handlers
  const handleSetProvinsiActive = useCallback((id: string, isActive: boolean) => {
    setProvinsiActiveMutation.mutate({ id, isActive });
  }, [setProvinsiActiveMutation]);

  const handleSetKabupatenKotaActive = useCallback((id: string, isActive: boolean) => {
    setKabupatenKotaActiveMutation.mutate({ id, isActive });
  }, [setKabupatenKotaActiveMutation]);

  const handleSetKecamatanActive = useCallback((id: string, isActive: boolean) => {
    setKecamatanActiveMutation.mutate({ id, isActive });
  }, [setKecamatanActiveMutation]);

  const handleSetDesaActive = useCallback((id: string, isActive: boolean) => {
    setDesaActiveMutation.mutate({ id, isActive });
  }, [setDesaActiveMutation]);

  // Delete Handlers
  const handleDeleteProvinsi = useCallback((id: string) => {
    deleteProvinsiMutation.mutate({ id });
  }, [deleteProvinsiMutation]);

  const handleDeleteKabupatenKota = useCallback((id: string) => {
    deleteKabupatenKotaMutation.mutate({ id });
  }, [deleteKabupatenKotaMutation]);

  const handleDeleteKecamatan = useCallback((id: string) => {
    deleteKecamatanMutation.mutate({ id });
  }, [deleteKecamatanMutation]);

  const handleDeleteDesa = useCallback((id: string) => {
    deleteDesaMutation.mutate({ id });
  }, [deleteDesaMutation]);

  const renderHeader = () => {
    const FilterTab = ({ label, value, current, onPress }: { label: string; value: FilterStatus; current: FilterStatus; onPress: () => void }) => (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[
          styles.filterTab,
          current === value && styles.filterTabActive,
          { backgroundColor: current === value ? colors.primary : colors.surface, borderColor: current === value ? colors.primary : colors.border },
        ]}
      >
        <Text style={[styles.filterTabText, { color: current === value ? "#FFFFFF" : colors.foreground }]}>{label}</Text>
      </Pressable>
    );

    const getFilterState = () => {
      switch (currentLevel) {
        case "provinsi": return { filter: provinsiFilter, setFilter: setProvinsiFilter };
        case "kabupaten_kota": return { filter: kabupatenKotaFilter, setFilter: setKabupatenKotaFilter };
        case "kecamatan": return { filter: kecamatanFilter, setFilter: setKecamatanFilter };
        case "desa": return { filter: desaFilter, setFilter: setDesaFilter };
      }
    };

    const { filter, setFilter } = getFilterState();

    const renderFilterTabs = () => (
      <View style={styles.filterTabs}>
        <FilterTab label="Aktif" value="active" current={filter} onPress={() => setFilter("active")} />
        <FilterTab label="Tidak Aktif" value="inactive" current={filter} onPress={() => setFilter("inactive")} />
        <FilterTab label="Semua" value="all" current={filter} onPress={() => setFilter("all")} />
      </View>
    );

    if (currentLevel === "provinsi") {
      return (
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={handleBack} style={{ ...styles.backButton, borderColor: colors.border }}>
            <AppIcon name="chevron-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>SYSADMIN</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Master Geografi</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tambah Provinsi"
            onPress={() => setShowCreateProvinsiModal(true)}
            style={({ pressed: isPressed }) => [styles.addButton, { backgroundColor: colors.primary }, isPressed && styles.pressed]}
          >
            <AppIcon name="add" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      );
    }

    if (currentLevel === "kabupaten_kota") {
      return (
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={handleBack} style={{ ...styles.backButton, borderColor: colors.border }}>
            <AppIcon name="chevron-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>MASTER GEOGRAFI</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Kabupaten/Kota</Text>
            {renderFilterTabs()}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tambah Kabupaten/Kota"
            onPress={() => setShowCreateKabupatenKotaModal(true)}
            style={({ pressed: isPressed }) => [styles.addButton, { backgroundColor: colors.primary }, isPressed && styles.pressed]}
          >
            <AppIcon name="add" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      );
    }

    if (currentLevel === "kecamatan") {
      return (
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={handleBack} style={{ ...styles.backButton, borderColor: colors.border }}>
            <AppIcon name="chevron-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>MASTER GEOGRAFI</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Kecamatan</Text>
            {renderFilterTabs()}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tambah Kecamatan"
            onPress={() => setShowCreateKecamatanModal(true)}
            style={({ pressed: isPressed }) => [styles.addButton, { backgroundColor: colors.primary }, isPressed && styles.pressed]}
          >
            <AppIcon name="add" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      );
    }

    const breadcrumbs: Array<{ label: string; onPress?: () => void }> = [];
    if (selectedProvinsi) breadcrumbs.push({ label: selectedProvinsi.nama, onPress: () => { setCurrentLevel("provinsi"); setSelectedProvinsi(null); } });
    if (selectedKabupatenKota) breadcrumbs.push({ label: selectedKabupatenKota.nama, onPress: () => { setCurrentLevel("kabupaten_kota"); setSelectedKabupatenKota(null); } });
    if (selectedKecamatan) breadcrumbs.push({ label: selectedKecamatan.nama, onPress: () => { setCurrentLevel("kecamatan"); setSelectedKecamatan(null); } });

    return (
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={handleBack} style={{ ...styles.backButton, borderColor: colors.border }}>
          <AppIcon name="chevron-left" size={21} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>MASTER GEOGRAFI</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>{getLevelLabel()}</Text>
          {breadcrumbs.length > 0 && (
            <View style={styles.breadcrumbRow}>
              {breadcrumbs.map((crumb, index) => (
                <Pressable key={index} onPress={crumb.onPress} style={{ ...styles.breadcrumbItem, opacity: 1 }}>
                  <Text style={[styles.breadcrumbText, { color: index === breadcrumbs.length - 1 ? colors.primary : colors.muted }]}>{crumb.label}</Text>
                  {index < breadcrumbs.length - 1 && <AppIcon name="chevron-right" size={14} color={colors.muted} />}
                </Pressable>
              ))}
            </View>
          )}
          {renderFilterTabs()}
        </View>
        {currentLevel === "desa" && selectedKecamatan && selectedKabupatenKota && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tambah Desa/Kelurahan"
            onPress={() => setShowCreateDesaModal(true)}
            style={({ pressed: isPressed }) => [styles.addButton, { backgroundColor: colors.primary }, isPressed && styles.pressed]}
          >
            <AppIcon name="add" size={20} color="#FFFFFF" />
          </Pressable>
        )}
        {currentLevel !== "desa" && <View style={styles.headerSpacer} />}
      </View>
    );
  };

  const getLevelLabel = () => {
    switch (currentLevel) {
      case "provinsi": return "Provinsi";
      case "kabupaten_kota": return "Kabupaten/Kota";
      case "kecamatan": return "Kecamatan";
      case "desa": return "Desa/Kelurahan";
    }
  };

  const renderContent = () => {
    if (currentLevel === "provinsi") {
      return renderProvinsiList();
    }
    if (currentLevel === "kabupaten_kota") {
      return renderKabupatenKotaList();
    }
    if (currentLevel === "kecamatan") {
      return renderKecamatanList();
    }
    return renderDesaList();
  };

  const renderProvinsiList = () => {
    if (provinsiQuery.isLoading) return <LoadingView />;
    if (provinsiQuery.error) return <ErrorView onRetry={() => void provinsiQuery.refetch()} />;
    if (!provinsiQuery.data || provinsiQuery.data.length === 0) return <EmptyView message="Belum ada provinsi." />;

    return (
      <FlatList
        data={provinsiQuery.data}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => handleSelectProvinsi(item)}
            style={styles.listItem}
          >
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.nama}</Text>
              <View style={styles.statusRow}>
                <View style={[
                  styles.statusBadge,
                  item.isActive ? styles.statusActive : styles.statusInactive,
                ]}>
                  <Text style={styles.statusBadgeText}>{item.isActive ? "Aktif" : "Tidak Aktif"}</Text>
                </View>
              </View>
            </View>
            <View style={styles.itemActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.nama}`}
                onPress={() => {
                  setEditProvinsiId(item.id);
                  setEditProvinsiName(item.nama);
                  setShowEditProvinsiModal(true);
                }}
                style={styles.actionButton}
              >
                <AppIcon name="edit" size={20} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.isActive ? `Nonaktifkan ${item.nama}` : `Aktifkan ${item.nama}`}
                onPress={() => handleSetProvinsiActive(item.id, !item.isActive)}
                style={styles.actionButton}
              >
                <AppIcon name={item.isActive ? "eye-off" : "eye"} size={20} color={item.isActive ? colors.error : colors.success} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Hapus ${item.nama}`}
                onPress={() => {
                  Alert.alert(
                    "Hapus Provinsi?",
                    `Hapus "${item.nama}"? Data tidak dapat dipulihkan.`,
                    [
                      { text: "Batal", style: "cancel" },
                      { text: "Hapus", style: "destructive", onPress: () => handleDeleteProvinsi(item.id) },
                    ]
                  );
                }}
                style={styles.actionButton}
              >
                <AppIcon name="delete" size={20} color={colors.error} />
              </Pressable>
            </View>
          </Pressable>
        )}
      />
    );
  };

  const renderKabupatenKotaList = () => {
    if (!selectedProvinsi) return <EmptyView message="Pilih provinsi terlebih dahulu." />;

    if (kabupatenKotaQuery.isLoading) return <LoadingView />;
    if (kabupatenKotaQuery.error) return <ErrorView onRetry={() => void kabupatenKotaQuery.refetch()} />;
    if (!kabupatenKotaQuery.data || kabupatenKotaQuery.data.length === 0) return <EmptyView message="Belum ada Kabupaten/Kota di provinsi ini." />;

    return (
      <FlatList
        data={kabupatenKotaQuery.data}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => handleSelectKabupatenKota(item)}
            style={styles.listItem}
          >
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.nama}</Text>
              <View style={styles.statusRow}>
                <View style={[
                  styles.statusBadge,
                  item.isActive ? styles.statusActive : styles.statusInactive,
                ]}>
                  <Text style={styles.statusBadgeText}>{item.isActive ? "Aktif" : "Tidak Aktif"}</Text>
                </View>
              </View>
            </View>
            <View style={styles.itemActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.nama}`}
                onPress={() => {
                  setEditKabupatenKotaId(item.id);
                  setEditKabupatenKotaName(item.nama);
                  setShowEditKabupatenKotaModal(true);
                }}
                style={styles.actionButton}
              >
                <AppIcon name="edit" size={20} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.isActive ? `Nonaktifkan ${item.nama}` : `Aktifkan ${item.nama}`}
                onPress={() => handleSetKabupatenKotaActive(item.id, !item.isActive)}
                style={styles.actionButton}
              >
                <AppIcon name={item.isActive ? "eye-off" : "eye"} size={20} color={item.isActive ? colors.error : colors.success} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Hapus ${item.nama}`}
                onPress={() => {
                  Alert.alert(
                    "Hapus Kabupaten/Kota?",
                    `Hapus "${item.nama}"? Data tidak dapat dipulihkan.`,
                    [
                      { text: "Batal", style: "cancel" },
                      { text: "Hapus", style: "destructive", onPress: () => handleDeleteKabupatenKota(item.id) },
                    ]
                  );
                }}
                style={styles.actionButton}
              >
                <AppIcon name="delete" size={20} color={colors.error} />
              </Pressable>
            </View>
          </Pressable>
        )}
      />
    );
  };

  const renderKecamatanList = () => {
    if (!selectedKabupatenKota) return <EmptyView message="Pilih Kabupaten/Kota terlebih dahulu." />;

    if (kecamatanQuery.isLoading) return <LoadingView />;
    if (kecamatanQuery.error) return <ErrorView onRetry={() => void kecamatanQuery.refetch()} />;
    if (!kecamatanQuery.data || kecamatanQuery.data.length === 0) return <EmptyView message="Belum ada Kecamatan di Kabupaten/Kota ini." />;

    return (
      <FlatList
        data={kecamatanQuery.data}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => handleSelectKecamatan(item)}
            style={styles.listItem}
          >
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.nama}</Text>
              <View style={styles.statusRow}>
                <View style={[
                  styles.statusBadge,
                  item.isActive ? styles.statusActive : styles.statusInactive,
                ]}>
                  <Text style={styles.statusBadgeText}>{item.isActive ? "Aktif" : "Tidak Aktif"}</Text>
                </View>
              </View>
            </View>
            <View style={styles.itemActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.nama}`}
                onPress={() => {
                  setEditKecamatanId(item.id);
                  setEditKecamatanName(item.nama);
                  setShowEditKecamatanModal(true);
                }}
                style={styles.actionButton}
              >
                <AppIcon name="edit" size={20} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.isActive ? `Nonaktifkan ${item.nama}` : `Aktifkan ${item.nama}`}
                onPress={() => handleSetKecamatanActive(item.id, !item.isActive)}
                style={styles.actionButton}
              >
                <AppIcon name={item.isActive ? "eye-off" : "eye"} size={20} color={item.isActive ? colors.error : colors.success} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Hapus ${item.nama}`}
                onPress={() => {
                  Alert.alert(
                    "Hapus Kecamatan?",
                    `Hapus "${item.nama}"? Data tidak dapat dipulihkan.`,
                    [
                      { text: "Batal", style: "cancel" },
                      { text: "Hapus", style: "destructive", onPress: () => handleDeleteKecamatan(item.id) },
                    ]
                  );
                }}
                style={styles.actionButton}
              >
                <AppIcon name="delete" size={20} color={colors.error} />
              </Pressable>
            </View>
          </Pressable>
        )}
      />
    );
  };

  const renderDesaList = () => {
    if (!selectedKecamatan) return <EmptyView message="Pilih Kecamatan terlebih dahulu." />;

    if (desaQuery.isLoading) return <LoadingView />;
    if (desaQuery.error) return <ErrorView onRetry={() => void desaQuery.refetch()} />;
    if (!desaQuery.data || desaQuery.data.length === 0) return <EmptyView message="Belum ada Desa/Kelurahan di Kecamatan ini." />;

    return (
      <FlatList
        data={desaQuery.data}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            style={styles.listItem}
          >
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.nama}</Text>
              <View style={styles.statusRow}>
                <View style={[
                  styles.statusBadge,
                  item.isActive ? styles.statusActive : styles.statusInactive,
                ]}>
                  <Text style={styles.statusBadgeText}>{item.isActive ? "Aktif" : "Tidak Aktif"}</Text>
                </View>
              </View>
            </View>
            <View style={styles.itemActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.nama}`}
                onPress={() => {
                  setEditDesaId(item.id);
                  setEditDesaName(item.nama);
                  setEditDesaKodePos("");
                  setShowEditDesaModal(true);
                }}
                style={styles.actionButton}
              >
                <AppIcon name="edit" size={20} color={colors.primary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.isActive ? `Nonaktifkan ${item.nama}` : `Aktifkan ${item.nama}`}
                onPress={() => handleSetDesaActive(item.id, !item.isActive)}
                style={styles.actionButton}
              >
                <AppIcon name={item.isActive ? "eye-off" : "eye"} size={20} color={item.isActive ? colors.error : colors.success} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Hapus ${item.nama}`}
                onPress={() => {
                  Alert.alert(
                    "Hapus Desa/Kelurahan?",
                    `Hapus "${item.nama}"? Data outlet akan tetap tersimpan.`,
                    [
                      { text: "Batal", style: "cancel" },
                      { text: "Hapus", style: "destructive", onPress: () => handleDeleteDesa(item.id) },
                    ]
                  );
                }}
                style={styles.actionButton}
              >
                <AppIcon name="delete" size={20} color={colors.error} />
              </Pressable>
            </View>
          </Pressable>
        )}
      />
    );
  };

  return (
    <SysAdminRouteGuard>
      <ScreenContainer className="px-5">
        <View style={styles.container}>
          {renderHeader()}
          <View style={styles.content}>
            {renderContent()}
          </View>
        </View>
      </ScreenContainer>
      <CreateProvinsiModal
        visible={showCreateProvinsiModal}
        onClose={() => {
          setShowCreateProvinsiModal(false);
          setProvinsiName("");
          setCreateError(null);
        }}
        onSubmit={handleCreateProvinsi}
        isSubmitting={createProvinsiMutation.isPending}
        provinsiName={provinsiName}
        onNameChange={setProvinsiName}
        error={createError}
      />
      <CreateKabupatenKotaModal
        visible={showCreateKabupatenKotaModal}
        onClose={() => {
          setShowCreateKabupatenKotaModal(false);
          setKabupatenKotaName("");
          setKabupatenKotaType("KABUPATEN");
          setCreateKabupatenKotaError(null);
        }}
        onSubmit={handleCreateKabupatenKota}
        isSubmitting={createKabupatenKotaMutation.isPending}
        kabupatenKotaName={kabupatenKotaName}
        onNameChange={setKabupatenKotaName}
        kabupatenKotaType={kabupatenKotaType}
        onTypeChange={setKabupatenKotaType}
        error={createKabupatenKotaError}
        provinsi={selectedProvinsi}
      />
      <CreateKecamatanModal
        visible={showCreateKecamatanModal}
        onClose={() => {
          setShowCreateKecamatanModal(false);
          setKecamatanName("");
          setCreateKecamatanError(null);
        }}
        onSubmit={handleCreateKecamatan}
        isSubmitting={createKecamatanMutation.isPending}
        kecamatanName={kecamatanName}
        onNameChange={setKecamatanName}
        error={createKecamatanError}
        kabupatenKota={selectedKabupatenKota}
      />
      <CreateDesaModal
        visible={showCreateDesaModal}
        onClose={() => {
          setShowCreateDesaModal(false);
          setDesaName("");
          setDesaKodePos("");
          setCreateDesaError(null);
        }}
        onSubmit={handleCreateDesa}
        isSubmitting={createDesaMutation.isPending}
        desaName={desaName}
        onNameChange={setDesaName}
        desaKodePos={desaKodePos}
        onKodePosChange={setDesaKodePos}
        error={createDesaError}
        kabupatenKota={selectedKabupatenKota}
        kecamatan={selectedKecamatan}
      />
      <EditProvinsiModal
        visible={showEditProvinsiModal}
        onClose={() => {
          setShowEditProvinsiModal(false);
          setEditProvinsiName("");
          setEditProvinsiError(null);
        }}
        onSubmit={handleEditProvinsi}
        isSubmitting={updateProvinsiMutation.isPending}
        provinsiName={editProvinsiName}
        onNameChange={setEditProvinsiName}
        error={editProvinsiError}
      />
      <EditKabupatenKotaModal
        visible={showEditKabupatenKotaModal}
        onClose={() => {
          setShowEditKabupatenKotaModal(false);
          setEditKabupatenKotaName("");
          setEditKabupatenKotaType("KABUPATEN");
          setEditKabupatenKotaError(null);
        }}
        onSubmit={handleEditKabupatenKota}
        isSubmitting={updateKabupatenKotaMutation.isPending}
        kabupatenKotaName={editKabupatenKotaName}
        onNameChange={setEditKabupatenKotaName}
        kabupatenKotaType={editKabupatenKotaType}
        onTypeChange={setEditKabupatenKotaType}
        error={editKabupatenKotaError}
        provinsi={selectedProvinsi}
      />
      <EditKecamatanModal
        visible={showEditKecamatanModal}
        onClose={() => {
          setShowEditKecamatanModal(false);
          setEditKecamatanName("");
          setEditKecamatanError(null);
        }}
        onSubmit={handleEditKecamatan}
        isSubmitting={updateKecamatanMutation.isPending}
        kecamatanName={editKecamatanName}
        onNameChange={setEditKecamatanName}
        error={editKecamatanError}
        kabupatenKota={selectedKabupatenKota}
      />
      <EditDesaModal
        visible={showEditDesaModal}
        onClose={() => {
          setShowEditDesaModal(false);
          setEditDesaName("");
          setEditDesaKodePos("");
          setEditDesaError(null);
        }}
        onSubmit={handleEditDesa}
        isSubmitting={updateDesaMutation.isPending}
        desaName={editDesaName}
        onNameChange={setEditDesaName}
        desaKodePos={editDesaKodePos}
        onKodePosChange={setEditDesaKodePos}
        error={editDesaError}
        kabupatenKota={selectedKabupatenKota}
        kecamatan={selectedKecamatan}
      />
    </SysAdminRouteGuard>
  );
}

function LoadingView() {
  const colors = useColors();
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.muted, marginTop: 12 }]}>Memuat data...</Text>
    </View>
  );
}

function EmptyView({ message }: { message: string }) {
  const colors = useColors();
  return (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyText, { color: colors.muted }]}>{message}</Text>
    </View>
  );
}

function ErrorView({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyText, { color: colors.error }]}>Gagal memuat data.</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={{ ...styles.retryButton, backgroundColor: colors.primary }}>
        <Text style={styles.retryButtonText}>Coba Lagi</Text>
      </Pressable>
    </View>
  );
}

// Create Provinsi Modal
function CreateProvinsiModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
  provinsiName,
  onNameChange,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  provinsiName: string;
  onNameChange: (name: string) => void;
  error: string | null;
}) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Tambah Provinsi</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA PROVINSI *</Text>
            <TextInput
              value={provinsiName}
              onChangeText={onNameChange}
              placeholder="contoh: Nusa Tenggara Barat"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={120}
            />
            {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Kode BPS diatur otomatis oleh sistem.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onSubmit}
              style={({ pressed: isPressed }) => [
                styles.submitButton,
                { backgroundColor: isSubmitting ? colors.muted : colors.primary },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "Menyimpan..." : "Simpan Provinsi"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onClose}
              style={({ pressed: isPressed }) => [
                styles.cancelButton,
                { borderColor: colors.border },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Create Kabupaten/Kota Modal
function CreateKabupatenKotaModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
  kabupatenKotaName,
  onNameChange,
  kabupatenKotaType,
  onTypeChange,
  error,
  provinsi,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  kabupatenKotaName: string;
  onNameChange: (name: string) => void;
  kabupatenKotaType: KabupatenKotaType;
  onTypeChange: (type: KabupatenKotaType) => void;
  error: string | null;
  provinsi: Provinsi | null;
}) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Tambah Kabupaten/Kota</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            {provinsi && (
              <View style={styles.parentInfo}>
                <Text style={[styles.parentInfoLabel, { color: colors.muted }]}>Provinsi:</Text>
                <Text style={[styles.parentInfoValue, { color: colors.foreground }]}>{provinsi?.nama}</Text>
              </View>
            )}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA KABUPATEN/KOTA *</Text>
            <TextInput
              value={kabupatenKotaName}
              onChangeText={onNameChange}
              placeholder="contoh: Lombok Tengah"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={120}
            />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>TIPE *</Text>
            <View style={styles.typeSelector}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onTypeChange("KABUPATEN")}
                style={({ pressed: isPressed }) => [
                  styles.typeButton,
                  { backgroundColor: kabupatenKotaType === "KABUPATEN" ? colors.primary : colors.surface, borderColor: kabupatenKotaType === "KABUPATEN" ? colors.primary : colors.border },
                  isPressed && styles.pressed,
                ]}
                disabled={isSubmitting}
              >
                <Text style={[
                  styles.typeButtonText,
                  { color: kabupatenKotaType === "KABUPATEN" ? "#FFFFFF" : colors.foreground },
                ]}>
                  KABUPATEN
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onTypeChange("KOTA")}
                style={({ pressed: isPressed }) => [
                  styles.typeButton,
                  { backgroundColor: kabupatenKotaType === "KOTA" ? colors.primary : colors.surface, borderColor: kabupatenKotaType === "KOTA" ? colors.primary : colors.border },
                  isPressed && styles.pressed,
                ]}
                disabled={isSubmitting}
              >
                <Text style={[
                  styles.typeButtonText,
                  { color: kabupatenKotaType === "KOTA" ? "#FFFFFF" : colors.foreground },
                ]}>
                  KOTA
                </Text>
              </Pressable>
            </View>
            {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Kode BPS diatur otomatis oleh sistem.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onSubmit}
              style={({ pressed: isPressed }) => [
                styles.submitButton,
                { backgroundColor: isSubmitting ? colors.muted : colors.primary },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "Menyimpan..." : "Simpan Kabupaten/Kota"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onClose}
              style={({ pressed: isPressed }) => [
                styles.cancelButton,
                { borderColor: colors.border },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Create Kecamatan Modal
function CreateKecamatanModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
  kecamatanName,
  onNameChange,
  error,
  kabupatenKota,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  kecamatanName: string;
  onNameChange: (name: string) => void;
  error: string | null;
  kabupatenKota: KabupatenKota | null;
}) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Tambah Kecamatan</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            {kabupatenKota && (
              <View style={styles.parentInfo}>
                <Text style={[styles.parentInfoLabel, { color: colors.muted }]}>Kabupaten/Kota:</Text>
                <Text style={[styles.parentInfoValue, { color: colors.foreground }]}>{kabupatenKota.nama}</Text>
              </View>
            )}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA KECAMATAN *</Text>
            <TextInput
              value={kecamatanName}
              onChangeText={onNameChange}
              placeholder="contoh: Praya"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={120}
            />
            {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Kode BPS diatur otomatis oleh sistem.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onSubmit}
              style={({ pressed: isPressed }) => [
                styles.submitButton,
                { backgroundColor: isSubmitting ? colors.muted : colors.primary },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "Menyimpan..." : "Simpan Kecamatan"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onClose}
              style={({ pressed: isPressed }) => [
                styles.cancelButton,
                { borderColor: colors.border },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Create Desa Modal
function CreateDesaModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
  desaName,
  onNameChange,
  desaKodePos,
  onKodePosChange,
  error,
  kabupatenKota,
  kecamatan,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  desaName: string;
  onNameChange: (name: string) => void;
  desaKodePos: string;
  onKodePosChange: (kodePos: string) => void;
  error: string | null;
  kabupatenKota: KabupatenKota | null;
  kecamatan: Kecamatan | null;
}) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Tambah Desa/Kelurahan</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            {kabupatenKota && (
              <View style={styles.parentInfo}>
                <Text style={[styles.parentInfoLabel, { color: colors.muted }]}>Kabupaten/Kota:</Text>
                <Text style={[styles.parentInfoValue, { color: colors.foreground }]}>{kabupatenKota.nama}</Text>
              </View>
            )}
            {kecamatan && (
              <View style={styles.parentInfo}>
                <Text style={[styles.parentInfoLabel, { color: colors.muted }]}>Kecamatan:</Text>
                <Text style={[styles.parentInfoValue, { color: colors.foreground }]}>{kecamatan.nama}</Text>
              </View>
            )}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA DESA/KELURAHAN *</Text>
            <TextInput
              value={desaName}
              onChangeText={onNameChange}
              placeholder="contoh: Praya Barat"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={120}
            />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>KODE POS</Text>
            <TextInput
              value={desaKodePos}
              onChangeText={onKodePosChange}
              placeholder="contoh: 83511"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={10}
            />
            {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Kode BPS diatur otomatis oleh sistem.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onSubmit}
              style={({ pressed: isPressed }) => [
                styles.submitButton,
                { backgroundColor: isSubmitting ? colors.muted : colors.primary },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "Menyimpan..." : "Simpan Desa/Kelurahan"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onClose}
              style={({ pressed: isPressed }) => [
                styles.cancelButton,
                { borderColor: colors.border },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Edit Provinsi Modal
function EditProvinsiModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
  provinsiName,
  onNameChange,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  provinsiName: string;
  onNameChange: (name: string) => void;
  error: string | null;
}) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Provinsi</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA PROVINSI *</Text>
            <TextInput
              value={provinsiName}
              onChangeText={onNameChange}
              placeholder="contoh: Nusa Tenggara Barat"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={120}
            />
            {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Kode BPS diatur otomatis oleh sistem.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onSubmit}
              style={({ pressed: isPressed }) => [
                styles.submitButton,
                { backgroundColor: isSubmitting ? colors.muted : colors.primary },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onClose}
              style={({ pressed: isPressed }) => [
                styles.cancelButton,
                { borderColor: colors.border },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Edit Kabupaten/Kota Modal
function EditKabupatenKotaModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
  kabupatenKotaName,
  onNameChange,
  kabupatenKotaType,
  onTypeChange,
  error,
  provinsi,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  kabupatenKotaName: string;
  onNameChange: (name: string) => void;
  kabupatenKotaType: KabupatenKotaType;
  onTypeChange: (type: KabupatenKotaType) => void;
  error: string | null;
  provinsi: Provinsi | null;
}) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Kabupaten/Kota</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            {provinsi && (
              <View style={styles.parentInfo}>
                <Text style={[styles.parentInfoLabel, { color: colors.muted }]}>Provinsi:</Text>
                <Text style={[styles.parentInfoValue, { color: colors.foreground }]}>{provinsi?.nama}</Text>
              </View>
            )}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA KABUPATEN/KOTA *</Text>
            <TextInput
              value={kabupatenKotaName}
              onChangeText={onNameChange}
              placeholder="contoh: Lombok Tengah"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={120}
            />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>TIPE *</Text>
            <View style={styles.typeSelector}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onTypeChange("KABUPATEN")}
                style={({ pressed: isPressed }) => [
                  styles.typeButton,
                  { backgroundColor: kabupatenKotaType === "KABUPATEN" ? colors.primary : colors.surface, borderColor: kabupatenKotaType === "KABUPATEN" ? colors.primary : colors.border },
                  isPressed && styles.pressed,
                ]}
                disabled={isSubmitting}
              >
                <Text style={[
                  styles.typeButtonText,
                  { color: kabupatenKotaType === "KABUPATEN" ? "#FFFFFF" : colors.foreground },
                ]}>
                  KABUPATEN
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onTypeChange("KOTA")}
                style={({ pressed: isPressed }) => [
                  styles.typeButton,
                  { backgroundColor: kabupatenKotaType === "KOTA" ? colors.primary : colors.surface, borderColor: kabupatenKotaType === "KOTA" ? colors.primary : colors.border },
                  isPressed && styles.pressed,
                ]}
                disabled={isSubmitting}
              >
                <Text style={[
                  styles.typeButtonText,
                  { color: kabupatenKotaType === "KOTA" ? "#FFFFFF" : colors.foreground },
                ]}>
                  KOTA
                </Text>
              </Pressable>
            </View>
            {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Kode BPS diatur otomatis oleh sistem.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onSubmit}
              style={({ pressed: isPressed }) => [
                styles.submitButton,
                { backgroundColor: isSubmitting ? colors.muted : colors.primary },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onClose}
              style={({ pressed: isPressed }) => [
                styles.cancelButton,
                { borderColor: colors.border },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Edit Kecamatan Modal
function EditKecamatanModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
  kecamatanName,
  onNameChange,
  error,
  kabupatenKota,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  kecamatanName: string;
  onNameChange: (name: string) => void;
  error: string | null;
  kabupatenKota: KabupatenKota | null;
}) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Kecamatan</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            {kabupatenKota && (
              <View style={styles.parentInfo}>
                <Text style={[styles.parentInfoLabel, { color: colors.muted }]}>Kabupaten/Kota:</Text>
                <Text style={[styles.parentInfoValue, { color: colors.foreground }]}>{kabupatenKota.nama}</Text>
              </View>
            )}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA KECAMATAN *</Text>
            <TextInput
              value={kecamatanName}
              onChangeText={onNameChange}
              placeholder="contoh: Praya"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={120}
            />
            {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Kode BPS diatur otomatis oleh sistem.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onSubmit}
              style={({ pressed: isPressed }) => [
                styles.submitButton,
                { backgroundColor: isSubmitting ? colors.muted : colors.primary },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onClose}
              style={({ pressed: isPressed }) => [
                styles.cancelButton,
                { borderColor: colors.border },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Edit Desa Modal
function EditDesaModal({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
  desaName,
  onNameChange,
  desaKodePos,
  onKodePosChange,
  error,
  kabupatenKota,
  kecamatan,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  desaName: string;
  onNameChange: (name: string) => void;
  desaKodePos: string;
  onKodePosChange: (kodePos: string) => void;
  error: string | null;
  kabupatenKota: KabupatenKota | null;
  kecamatan: Kecamatan | null;
}) {
  const colors = useColors();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
        keyboardVerticalOffset={0}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Desa/Kelurahan</Text>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <AppIcon name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            {kabupatenKota && (
              <View style={styles.parentInfo}>
                <Text style={[styles.parentInfoLabel, { color: colors.muted }]}>Kabupaten/Kota:</Text>
                <Text style={[styles.parentInfoValue, { color: colors.foreground }]}>{kabupatenKota.nama}</Text>
              </View>
            )}
            {kecamatan && (
              <View style={styles.parentInfo}>
                <Text style={[styles.parentInfoLabel, { color: colors.muted }]}>Kecamatan:</Text>
                <Text style={[styles.parentInfoValue, { color: colors.foreground }]}>{kecamatan.nama}</Text>
              </View>
            )}
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA DESA/KELURAHAN *</Text>
            <TextInput
              value={desaName}
              onChangeText={onNameChange}
              placeholder="contoh: Praya Barat"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={120}
            />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>KODE POS</Text>
            <TextInput
              value={desaKodePos}
              onChangeText={onKodePosChange}
              placeholder="contoh: 83511"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={onSubmit}
              style={[
                styles.input,
                { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              editable={!isSubmitting}
              maxLength={10}
            />
            {error ? <Text style={[styles.fieldError, { color: colors.error }]}>{error}</Text> : null}
            <Text style={[styles.fieldHint, { color: colors.muted }]}>Kode BPS diatur otomatis oleh sistem.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onSubmit}
              style={({ pressed: isPressed }) => [
                styles.submitButton,
                { backgroundColor: isSubmitting ? colors.muted : colors.primary },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={isSubmitting ? undefined : onClose}
              style={({ pressed: isPressed }) => [
                styles.cancelButton,
                { borderColor: colors.border },
                isPressed && styles.pressed,
              ]}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", paddingTop: 12, paddingBottom: 8, marginHorizontal: -5 },
  backButton: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 8 },
  headerCopy: { flex: 1 },
  headerSpacer: { width: 40 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, marginBottom: 2 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.4 },
  breadcrumbRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  breadcrumbItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  breadcrumbText: { fontSize: 12, fontWeight: "600" },
  content: { flex: 1, paddingTop: 8 },
  listContent: { paddingBottom: 24, paddingHorizontal: 5 },
  listItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  itemContent: { flex: 1, marginRight: 12 },
  itemTitle: { fontSize: 15, fontWeight: "800" },
  itemSubtitle: { fontSize: 12, marginTop: 2 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  loadingText: { fontSize: 14, fontWeight: "600" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  emptyText: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  retryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  // Create Provinsi Modal Styles
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContainer: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#EEEEEE" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#111111" },
  modalCloseButton: { padding: 4 },
  modalContent: { padding: 20, gap: 16 },
  fieldLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: "#888888" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, borderColor: "#DDDDDD" },
  fieldError: { fontSize: 12, color: "#E53935", marginTop: 4 },
  fieldHint: { fontSize: 11, color: "#888888", marginTop: 4 },
  submitButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, marginTop: 8 },
  submitButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  cancelButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, borderWidth: 1 },
  cancelButtonText: { fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, marginTop: 8, paddingHorizontal: 16 },
  // Create Kabupaten/Kota Modal Styles
  parentInfo: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  parentInfoLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: "#888888" },
  parentInfoValue: { fontSize: 14, fontWeight: "600", color: "#111111" },
  typeSelector: { flexDirection: "row", gap: 8, marginTop: 4 },
  typeButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: "#DDDDDD" },
  typeButtonText: { fontSize: 14, fontWeight: "700" },
  // Filter & Status Styles
  filterTabs: { flexDirection: "row", gap: 6, marginTop: 8 },
  filterTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  filterTabActive: {},
  filterTabText: { fontSize: 11, fontWeight: "700" },
  statusRow: { marginTop: 4 },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusActive: { backgroundColor: "#E8F5E9" },
  statusInactive: { backgroundColor: "#FFEBEE" },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  itemActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionButton: { padding: 4 },
});