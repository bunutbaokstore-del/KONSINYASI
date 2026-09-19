import { AdminRouteGuard } from "@/components/admin-route-guard";
import { AppIcon } from "@/components/ui/app-icon";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import type { OutletRecord, RuteDetail, DayOfWeek, OutletFormValue } from "@/shared/distribution";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type ScreenView = "list" | "detail" | "create" | "edit";

type PhotoSelection = { fileName: string; path: string };

export default function AdminOutletScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [view, setView] = useState<ScreenView>("list");
  const [search, setSearch] = useState("");
  const [lastCreated, setLastCreated] = useState<{ nama: string; kode: string } | null>(null);
  const [selectedOutlet, setSelectedOutlet] = useState<OutletRecord | null>(null);
  // For create outlet: track pending photo to upload after create
  const [pendingPhoto, setPendingPhoto] = useState<{ base64: string; contentType: "image/jpeg" | "image/png" | "image/webp"; outletId: string } | null>(null);

  const listQuery = trpc.distribution.listOutlet.useQuery(undefined, { enabled: isAuthenticated });
  const uploadPhoto = trpc.distribution.uploadOutletPhoto.useMutation();
  const createMutation = trpc.distribution.createOutlet.useMutation({
    onSuccess: (outlet) => {
      setLastCreated({ nama: outlet.nama, kode: outlet.kode });
      // If there's a pending photo, upload it after outlet is created
      if (pendingPhoto) {
        uploadPhoto.mutate(
          { outletId: outlet.id, base64: pendingPhoto.base64, contentType: pendingPhoto.contentType },
          {
            onSuccess: () => {
              void utils.distribution.invalidate();
            },
            onError: (error) => {
              Alert.alert("Foto gagal diunggah", `Outlet "${outlet.nama}" berhasil dibuat, tetapi foto gagal diunggah. Silakan edit outlet untuk mencoba kembali.\n\n${error.message}`);
              void utils.distribution.invalidate();
            },
          }
        );
        setPendingPhoto(null);
      } else {
        setView("list");
        void utils.distribution.invalidate();
      }
    },
    onError: (error) => {
      setPendingPhoto(null);
    },
  });
  const updateMutation = trpc.distribution.updateOutlet.useMutation({
    onSuccess: () => {
      setView("list");
      setSelectedOutlet(null);
      void utils.distribution.invalidate();
    },
  });

  const filtered = (listQuery.data ?? []).filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.kode.toLowerCase().includes(q) || item.nama.toLowerCase().includes(q) || (item.namaPemilik ?? "").toLowerCase().includes(q);
  });

  if (view === "create") {
    return (
      <AdminRouteGuard>
        <OutletFormScreen
          onBack={() => setView("list")}
          onSubmit={(input) => createMutation.mutate(input)}
          mutationError={createMutation.error?.message ?? null}
          isSubmitting={createMutation.isPending}
          onSetPendingPhoto={setPendingPhoto}
        />
      </AdminRouteGuard>
    );
  }

  if (view === "detail" && selectedOutlet) {
    return (
      <AdminRouteGuard>
        <OutletDetailScreen
          outlet={selectedOutlet}
          onBack={() => {
            setView("list");
            setSelectedOutlet(null);
          }}
          onEdit={() => setView("edit")}
          onMutate={() => void utils.distribution.invalidate()}
          colors={colors}
        />
      </AdminRouteGuard>
    );
  }

  if (view === "edit" && selectedOutlet) {
    return (
      <AdminRouteGuard>
        <OutletFormScreen
          initial={selectedOutlet}
          onBack={() => {
            setView("list");
            setSelectedOutlet(null);
          }}
          onSubmit={(input) => updateMutation.mutate({ outletId: selectedOutlet.id, ...input })}
          mutationError={updateMutation.error?.message ?? null}
          isSubmitting={updateMutation.isPending}
        />
      </AdminRouteGuard>
    );
  }

  return (
    <AdminRouteGuard>
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={filtered.length > 0 ? styles.listContent : styles.emptyContent}
          refreshControl={<RefreshControl refreshing={listQuery.isRefetching} onRefresh={() => void listQuery.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke Distribusi" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
                  <AppIcon name="chevron-left" size={21} color={colors.foreground} />
                </Pressable>
                <View style={styles.headerCopy}>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>DISTRIBUSI</Text>
                  <Text style={[styles.title, { color: colors.foreground }]}>Outlet</Text>
                </View>
                <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="building" size={21} color={colors.primary} /></View>
              </View>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Kelola data toko: nama, pemilik, lokasi, dan foto. Kode toko dibuat otomatis oleh sistem.</Text>
              {lastCreated ? (
                <View style={[styles.successCard, { backgroundColor: `${colors.success}12`, borderColor: colors.success }]}>
                  <AppIcon name="verified" size={18} color={colors.success} />
                  <View style={styles.successCopy}>
                    <Text style={[styles.successTitle, { color: colors.foreground }]} numberOfLines={1}>{`Outlet "${lastCreated.nama}" berhasil dibuat.`}</Text>
                    <Text style={[styles.successMeta, { color: colors.muted }]}>Kode Outlet: {lastCreated.kode}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Tutup pemberitahuan" onPress={() => setLastCreated(null)} style={({ pressed }) => [styles.iconButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="close" size={16} color={colors.muted} /></Pressable>
                </View>
              ) : null}
              <Pressable accessibilityRole="button" onPress={() => setView("create")} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <AppIcon name="add" size={18} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Tambah Outlet</Text>
              </Pressable>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Cari kode, nama toko, atau nama pemilik"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                style={[styles.searchInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              <View style={styles.sectionHeader}>
                <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daftar Outlet</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{filtered.length} outlet ditemukan</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Muat ulang outlet" onPress={() => void listQuery.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={18} color={colors.primary} /></Pressable>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <OutletListRow outlet={item} onEdit={() => { setSelectedOutlet(item); setView("detail"); }} onMutate={() => void utils.distribution.invalidate()} colors={colors} />
          )}
          ListEmptyComponent={OutletEmptyState(listQuery.isLoading, listQuery.error?.message ?? null, Boolean(search.trim()), colors)}
        />
      </ScreenContainer>
    </AdminRouteGuard>
  );
}

function OutletListRow({ outlet, onEdit, onMutate, colors }: { outlet: OutletRecord; onEdit: () => void; onMutate: () => void; colors: ReturnType<typeof useColors> }) {
  const setActiveMutation = trpc.distribution.setOutletActive.useMutation();
  const active = outlet.status === "ACTIVE";
  const handleDelete = () => {
    Alert.alert(
      "Hapus outlet ini?",
      `${outlet.nama}\n${outlet.kode}`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => {
            Alert.alert("Belum tersedia", "Hapus outlet belum didukung backend. Fitur ini menunggu keputusan backend (delete outlet). Tidak ada data yang dihapus.");
          },
        },
      ],
    );
  };
  return (
    <View style={[styles.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}16` }]}>
        <AppIcon name="building" size={18} color={colors.primary} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>{outlet.nama}</Text>
        <Text style={[styles.rowCode, { color: colors.muted }]} numberOfLines={1}>{outlet.kode}</Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={active ? `Outlet ${outlet.nama} aktif. Ketuk untuk menonaktifkan.` : `Outlet ${outlet.nama} nonaktif. Ketuk untuk mengaktifkan.`}
          onPress={() => setActiveMutation.mutate({ outletId: outlet.id, isActive: !active }, { onSuccess: onMutate })}
          style={({ pressed }) => [styles.statusPill, { backgroundColor: active ? `${colors.success}16` : `${colors.error}16` }, pressed && styles.pressed]}
        >
          <Text style={[styles.statusText, { color: active ? colors.success : colors.error }]}>{active ? "●  AKTIF" : "●  NONAKTIF"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${outlet.nama}`}
          onPress={onEdit}
          style={({ pressed }) => [styles.rowIconButton, pressed && styles.pressed]}
        >
          <AppIcon name="edit" size={17} color={colors.primary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Hapus ${outlet.nama}`}
          onPress={handleDelete}
          style={({ pressed }) => [styles.rowIconButton, pressed && styles.pressed]}
        >
          <AppIcon name="delete" size={17} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

function OutletDetailScreen({ outlet, onBack, onEdit, onMutate, colors }: { outlet: OutletRecord; onBack: () => void; onEdit: () => void; onMutate: () => void; colors: ReturnType<typeof useColors> }) {
  const [fotoFailed, setFotoFailed] = useState(false);
  const hasFoto = Boolean(outlet.fotoDepanUrl);
  const active = outlet.status === "ACTIVE";
  const hasGps = outlet.latitude != null && outlet.longitude != null;

  // Build photo URL using manus-storage proxy for private bucket
  const photoUrl = hasFoto ? `/manus-storage/${outlet.fotoDepanUrl}` : undefined;

  const ruteQuery = trpc.distribution.getRute.useQuery(
    { ruteId: outlet.activeRuteId as string },
    { enabled: !!outlet.activeRuteId }
  );
  const ruteDetail = ruteQuery.data as RuteDetail | undefined;
  const isLoadingRute = ruteQuery.isLoading;
  const ruteError = ruteQuery.error;
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.detailContent}>
        <View>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke daftar outlet" onPress={onBack} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
              <AppIcon name="chevron-left" size={21} color={colors.foreground} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>DISTRIBUSI</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Detail Toko</Text>
            </View>
          </View>

          <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {hasFoto && !fotoFailed ? (
              <Image source={{ uri: photoUrl }} style={styles.detailPhoto} resizeMode="cover" onError={() => setFotoFailed(true)} />
            ) : (
              <View style={[styles.detailPhotoFallback, { backgroundColor: `${colors.primary}16` }]}>
                <AppIcon name="building" size={28} color={colors.primary} />
                <Text style={styles.fotoPlaceholderText}>Foto belum tersedia</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.storeName, { color: colors.foreground }]} numberOfLines={1}>{outlet.nama}</Text>
                <View style={[styles.statusPill, { backgroundColor: active ? `${colors.success}16` : `${colors.error}16` }]}>
                  <Text style={[styles.statusText, { color: active ? colors.success : colors.error }]}>{active ? "●  AKTIF" : "●  NONAKTIF"}</Text>
                </View>
              </View>
              <Text style={[styles.storeCode, { color: colors.muted }]}>{outlet.kode}</Text>

              <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

              <SectionHeader title="INFORMASI PEMILIK" colors={colors} />
              <ContactRow icon="👤" label="Nama Pemilik" value={outlet.namaPemilik} placeholder="Belum diisi" colors={colors} />
              <ContactRow icon="📞" label="No. HP" value={outlet.noHp} placeholder="Belum diisi" colors={colors} />

              <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

              <SectionHeader title="LOKASI TOKO" colors={colors} />
              <ContactRow icon="📍" label="Alamat" value={outlet.alamatSingkat || outlet.alamat || null} placeholder="Alamat belum diisi" colors={colors} />
              {hasGps ? <ContactRow icon="📍" label="GPS Outlet" value={`${outlet.latitude}, ${outlet.longitude}`} placeholder="GPS belum tersedia" colors={colors} /> : null}
              {outlet.kabupatenKotaNama ? <ContactRow icon="🏙️" label="Kabupaten/Kota" value={outlet.kabupatenKotaNama} placeholder="Belum ditentukan" colors={colors} /> : null}
              {outlet.kecamatanNama ? <ContactRow icon="🏘️" label="Kecamatan" value={outlet.kecamatanNama} placeholder="Belum ditentukan" colors={colors} /> : null}
              {outlet.desaNama ? <ContactRow icon="🏡" label="Desa/Kelurahan" value={outlet.desaNama} placeholder="Belum ditentukan" colors={colors} /> : null}

              <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

              <SectionHeader title="JARINGAN TOKO" colors={colors} />
{outlet.activeRuteId ? (
                isLoadingRute ? (
                  <View style={styles.networkLoading}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={[styles.networkLoadingText, { color: colors.muted }]}>Memuat jaringan toko...</Text>
                  </View>
                ) : ruteError ? (
                  <View style={styles.networkError}>
                    <Text style={[styles.networkErrorText, { color: colors.error }]}>Data jaringan belum dapat dimuat.</Text>
                  </View>
                ) : (
                  <>
                    <InfoRow label="Wilayah" value={ruteDetail?.wilayah?.nama ?? null} placeholder="Belum ditentukan" colors={colors} />
                    <InfoRow label="Rute" value={ruteDetail?.rute?.nama ?? null} placeholder="Belum ditentukan" colors={colors} />
                    {ruteDetail?.sales && ruteDetail.sales.length > 0 ? (
                      <>
                        <InfoRow label="Sales" value={ruteDetail.sales.map((s) => s.nama).join("\n")} placeholder="Belum ditentukan" colors={colors} />
                      </>
                    ) : (
                      <InfoRow label="Sales" value={null} placeholder="Belum ditentukan" colors={colors} />
                    )}
                  </>
                )
              ) : (
                <>
                  <InfoRow label="Wilayah" value={null} placeholder="Belum ditentukan" colors={colors} />
                  <InfoRow label="Rute" value={null} placeholder="Belum ditentukan" colors={colors} />
                  <InfoRow label="Sales" value={null} placeholder="Belum ditentukan" colors={colors} />
                </>
              )}

              <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

              <SectionHeader title="HARI KUNJUNGAN" colors={colors} />
              {outlet.visitDays && outlet.visitDays.length > 0 ? (
                <VisitDaysDisplay days={outlet.visitDays} colors={colors} />
              ) : (
                <Text style={[styles.emptyVisitDays, { color: colors.muted }]}>Belum ditentukan</Text>
              )}

              <View style={styles.editButtonContainer}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit data ${outlet.nama}`}
                  onPress={onEdit}
                  style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                >
                  <AppIcon name="edit" size={16} color={colors.primary} />
                  <Text style={[styles.editButtonLabel, { color: colors.foreground }]}>Edit Data</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SectionHeader({ title, colors }: { title: string; colors: ReturnType<typeof useColors> }) {
  return (
    <Text style={[styles.sectionHeaderTitle, { color: colors.foreground }]}>{title}</Text>
  );
}

function ContactRow({ icon, label, value, placeholder, colors }: { icon: string; label: string; value: string | null; placeholder: string; colors: ReturnType<typeof useColors> }) {
  const has = value && value.trim().length > 0;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrapper}>
        <Text style={styles.infoIcon}>{icon}</Text>
      </View>
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: has ? colors.foreground : colors.muted }]} numberOfLines={1}>{has ? value : placeholder}</Text>
      </View>
    </View>
  );
}

function InfoRow({ label, value, placeholder, colors }: { label: string; value: string | null; placeholder: string; colors: ReturnType<typeof useColors> }) {
  const has = value && value.trim().length > 0;
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrapper}>
        <View style={styles.infoIconDot} />
      </View>
      <View style={styles.infoContent}>
        <Text style={[styles.infoLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: has ? colors.foreground : colors.muted }]} numberOfLines={has ? undefined : 1}>{has ? value : placeholder}</Text>
      </View>
    </View>
  );
}

function VisitDaysDisplay({ days, colors }: { days: DayOfWeek[]; colors: ReturnType<typeof useColors> }) {
  const dayMap: Record<DayOfWeek, string> = {
    MONDAY: "Senin",
    TUESDAY: "Selasa",
    WEDNESDAY: "Rabu",
    THURSDAY: "Kamis",
    FRIDAY: "Jumat",
    SATURDAY: "Sabtu",
    SUNDAY: "Minggu",
  };
  return (
    <Text style={[styles.visitDaysDisplay, { color: colors.foreground }]}>{days.map((d) => dayMap[d]).join(" • ")}</Text>
  );
}

function OutletEmptyState(isLoading: boolean, errorMessage: string | null, hasSearch: boolean, colors: ReturnType<typeof useColors>) {
  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (errorMessage) {
    return (
      <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AppIcon name="building" size={28} color={colors.error} />
        <Text style={[styles.stateTitle, { color: colors.foreground }]}>Outlet belum dapat dimuat</Text>
        <Text style={[styles.stateText, { color: colors.muted }]}>{errorMessage}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <AppIcon name="building" size={28} color={colors.muted} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>{hasSearch ? "Tidak ada outlet yang cocok" : "Belum ada outlet"}</Text>
      <Text style={[styles.stateText, { color: colors.muted }]}>{hasSearch ? "Ubah kata kunci pencarian Anda." : "Tambahkan outlet pertama untuk mulai menugaskannya ke rute."}</Text>
    </View>
  );
}



const DAY_OPTIONS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: "MONDAY", label: "Senin", short: "Sen" },
  { value: "TUESDAY", label: "Selasa", short: "Sel" },
  { value: "WEDNESDAY", label: "Rabu", short: "Rab" },
  { value: "THURSDAY", label: "Kamis", short: "Kam" },
  { value: "FRIDAY", label: "Jumat", short: "Jum" },
  { value: "SATURDAY", label: "Sabtu", short: "Sab" },
  { value: "SUNDAY", label: "Minggu", short: "Min" },
];

function VisitDaysPicker({ selected, onChange, colors, editable }: { selected: DayOfWeek[]; onChange: (days: DayOfWeek[]) => void; colors: ReturnType<typeof useColors>; editable: boolean }) {
  const toggle = (day: DayOfWeek) => {
    if (!editable) return;
    const next = selected.includes(day) ? selected.filter((d) => d !== day) : [...selected, day];
    onChange(next);
  };
  return (
    <View style={styles.visitDaysPicker}>
      {DAY_OPTIONS.map(({ value, label, short }) => (
        <Pressable
          key={value}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected.includes(value) }}
          accessibilityLabel={label}
          onPress={() => toggle(value)}
          style={({ pressed }) => [
            styles.dayChip,
            { backgroundColor: selected.includes(value) ? `${colors.primary}16` : colors.background, borderColor: selected.includes(value) ? colors.primary : colors.border },
            pressed && styles.pressed,
            !editable && styles.disabled,
          ]}
        >
          <Text style={[styles.dayChipText, { color: selected.includes(value) ? colors.primary : colors.muted, fontWeight: selected.includes(value) ? "800" : "600" }]}>{short}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type OutletFormScreenProps = {
  onBack: () => void;
  onSubmit: (input: OutletFormValue) => void;
  initial?: OutletRecord | null;
  mutationError?: string | null;
  isSubmitting?: boolean;
  onSetPendingPhoto?: (photo: { base64: string; contentType: "image/jpeg" | "image/png" | "image/webp"; outletId: string } | null) => void;
};

function OutletFormScreen({ onBack, onSubmit, initial, mutationError, isSubmitting, onSetPendingPhoto }: OutletFormScreenProps) {
  const colors = useColors();
  const isEdit = Boolean(initial);

  // Form state
  const [nama, setNama] = useState(initial?.nama ?? "");
  const [namaPemilik, setNamaPemilik] = useState(initial?.namaPemilik ?? "");
  const [noHp, setNoHp] = useState(initial?.noHp ?? "");
  const [alamat, setAlamat] = useState(initial?.alamat ?? "");
  const [latitude, setLatitude] = useState(initial?.latitude != null ? String(initial.latitude) : "");
  const [longitude, setLongitude] = useState(initial?.longitude != null ? String(initial.longitude) : "");
  const [photo, setPhoto] = useState<PhotoSelection | null>(initial?.fotoDepanUrl ? { fileName: "foto-toko.jpg", path: initial.fotoDepanUrl } : null);
  const [visitDays, setVisitDays] = useState<DayOfWeek[]>(initial?.visitDays ?? []);
  const [localError, setLocalError] = useState<string | null>(null);

  // Location hierarchy state (for cascading pickers)
  const [kabupatenKotaId, setKabupatenKotaId] = useState<string | null>(initial?.kabupatenKotaId ?? null);
  const [kecamatanId, setKecamatanId] = useState<string | null>(initial?.kecamatanId ?? null);
  const [desaId, setDesaId] = useState<string | null>(initial?.desaId ?? null);

  // Location display names (for showing selected values)
  const [kabupatenKotaNama, setKabupatenKotaNama] = useState<string | null>(initial?.kabupatenKotaNama ?? null);
  const [kecamatanNama, setKecamatanNama] = useState<string | null>(initial?.kecamatanNama ?? null);
  const [desaNama, setDesaNama] = useState<string | null>(initial?.desaNama ?? null);

  // Modal state for location pickers
  const [showKabupatenKotaModal, setShowKabupatenKotaModal] = useState(false);
  const [showKecamatanModal, setShowKecamatanModal] = useState(false);
  const [showDesaModal, setShowDesaModal] = useState(false);

  // Master data queries
  const kabupatenKotaQuery = trpc.distribution.listKabupatenKota.useQuery(undefined);
  const kecamatanQuery = trpc.distribution.listKecamatan.useQuery(
    { kabupatenKotaId: kabupatenKotaId! },
    { enabled: !!kabupatenKotaId }
  );
  const desaQuery = trpc.distribution.listDesa.useQuery(
    { kecamatanId: kecamatanId! },
    { enabled: !!kecamatanId }
  );

  // Upload mutation for outlet photo
  const uploadPhoto = trpc.distribution.uploadOutletPhoto.useMutation({
    onError: (error) => {
      setLocalError(error.message ?? "Foto gagal diunggah.");
    },
  });

  // Note: uploadOutletPhoto mutation is now available in backend
  const selectPhoto = async () => {
    if (isSubmitting || uploadPhoto.isPending) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.6,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) {
        setLocalError("Foto belum dapat dibaca. Silakan pilih foto lain.");
        return;
      }
      if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) {
        setLocalError("Ukuran foto maksimal 10 MB.");
        return;
      }
      const mimeType = (asset.mimeType ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
      const validMimeTypes: ("image/jpeg" | "image/png" | "image/webp")[] = ["image/jpeg", "image/png", "image/webp"];
      if (!validMimeTypes.includes(mimeType)) {
        setLocalError("Format foto tidak didukung. Gunakan JPG, PNG, atau WEBP.");
        return;
      }
      // For edit outlet: upload immediately
      if (isEdit && initial?.id) {
        const uploaded = await uploadPhoto.mutateAsync({
          outletId: initial.id,
          base64: asset.base64!,
          contentType: mimeType,
        });
        // Update local photo state with uploaded path
        setPhoto({ fileName: asset.fileName ?? `foto-${Date.now()}.jpg`, path: uploaded.path });
        setLocalError(null);
      } else {
        // For create outlet: store pending photo for later upload
        setPhoto({ fileName: asset.fileName ?? `foto-${Date.now()}.jpg`, path: `data:${mimeType};base64,${asset.base64}` });
        setLocalError(null);
        // Notify parent to track pending photo for upload after create
        onSetPendingPhoto?.({ base64: asset.base64!, contentType: mimeType, outletId: "" });
      }
    } catch {
      setLocalError("Foto belum dapat diproses. Coba lagi.");
    }
  };

  // Handle cascading selection: when kabupaten changes, reset kecamatan and desa
  const handleKabupatenKotaSelect = (newKabupatenKotaId: string | null, newKabupatenKotaNama: string | null) => {
    setKabupatenKotaId(newKabupatenKotaId);
    setKabupatenKotaNama(newKabupatenKotaNama);
    setKecamatanId(null);
    setKecamatanNama(null);
    setDesaId(null);
    setDesaNama(null);
  };

  // Handle cascading selection: when kecamatan changes, reset desa
  const handleKecamatanSelect = (newKecamatanId: string | null, newKecamatanNama: string | null) => {
    setKecamatanId(newKecamatanId);
    setKecamatanNama(newKecamatanNama);
    setDesaId(null);
    setDesaNama(null);
  };

  const handleDesaSelect = (newDesaId: string | null, newDesaNama: string | null) => {
    setDesaId(newDesaId);
    setDesaNama(newDesaNama);
  };

  const submit = () => {
    if (isSubmitting || uploadPhoto.isPending) return;
    const namaTrim = nama.trim();
    if (!namaTrim) {
      setLocalError("Nama toko wajib diisi.");
      return;
    }
    const cleanedNoHp = noHp.replace(/[\s()-]/g, "");
    if (cleanedNoHp && !/^\+?\d{8,15}$/.test(cleanedNoHp)) {
      setLocalError("Nomor HP tidak valid.");
      return;
    }
    const lat = latitude.trim() === "" ? null : Number(latitude);
    const lng = longitude.trim() === "" ? null : Number(longitude);
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
      setLocalError("Latitude harus antara -90 dan 90.");
      return;
    }
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
      setLocalError("Longitude harus antara -180 dan 180.");
      return;
    }
    setLocalError(null);
    // Only send desaId to backend (kecamatanId and kabupatenKotaId are derived from desa)
    // For create: don't send base64 as permanent photo; for edit: photo already uploaded
    const fotoForSubmit = isEdit ? (photo?.path ?? null) : null;
    onSubmit({
      nama: namaTrim,
      namaPemilik: namaPemilik.trim() || null,
      noHp: cleanedNoHp || null,
      alamat: alamat.trim() || null,
      latitude: lat,
      longitude: lng,
      fotoDepanUrl: fotoForSubmit,
      visitDays,
      desaId,
      kecamatanId: null, // not sent to backend
      kabupatenKotaId: null, // not sent to backend
    });
  };

  const displayError = localError ?? mutationError ?? null;

  // Location picker items (placeholder - need master data endpoints)
  // In a real implementation, these would come from backend master data APIs
  // For now, we use the data from the initial outlet if editing
  // Note: Master data endpoints (listKabupatenKota, listKecamatan, listDesa) are not yet available
  // This is a gap that needs backend implementation

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
        <View>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={isSubmitting ? undefined : onBack} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed, isSubmitting && styles.disabled]}>
              <AppIcon name="chevron-left" size={21} color={colors.foreground} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>DISTRIBUSI</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>{isEdit ? "Edit Outlet" : "Tambah Outlet"}</Text>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Kode toko dibuat otomatis oleh sistem.</Text>
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA TOKO *</Text>
            <TextInput value={nama} onChangeText={setNama} placeholder="contoh: Toko Berkah Jaya" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} editable={!isSubmitting} />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA PEMILIK (OPSIONAL)</Text>
            <TextInput value={namaPemilik} onChangeText={setNamaPemilik} placeholder="contoh: Budi Santoso" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} editable={!isSubmitting} />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NO HP (OPSIONAL)</Text>
            <TextInput value={noHp} onChangeText={setNoHp} placeholder="contoh: 081234567890" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} editable={!isSubmitting} />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>ALAMAT / DETAIL LOKASI (OPSIONAL)</Text>
            <TextInput value={alamat} onChangeText={setAlamat} placeholder="contoh: Jl. Merdeka No. 12, Kec. Cengkareng" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} editable={!isSubmitting} />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>GPS OUTLET (OPSIONAL)</Text>
            <View style={styles.gpsRow}>
              <TextInput value={latitude} onChangeText={setLatitude} placeholder="Latitude (-90 s.d. 90)" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={[styles.input, styles.gpsInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} editable={!isSubmitting} />
              <TextInput value={longitude} onChangeText={setLongitude} placeholder="Longitude (-180 s.d. 180)" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={[styles.input, styles.gpsInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} editable={!isSubmitting} />
            </View>
            <Text style={[styles.hintText, { color: colors.muted }]}>Pengambilan lokasi otomatis belum tersedia; isi koordinat secara manual jika diperlukan.</Text>

            <View style={[styles.sectionDivider, { backgroundColor: colors.border, marginTop: 16 }]} />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>LOKASI ADMINISTRATIF (OPSIONAL)</Text>
            <Text style={[styles.hintText, { color: colors.muted }]}>Pilih Kabupaten/Kota → Kecamatan → Desa. Hanya Desa yang disimpan ke backend.</Text>

            {/* Kabupaten/Kota Picker */}
            <View style={styles.pickerRow}>
              <Text style={[styles.pickerLabel, { color: colors.muted }]}>KABUPATEN / KOTA</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Kabupaten/Kota${kabupatenKotaNama ? `: ${kabupatenKotaNama}` : ", belum dipilih"}`}
                onPress={() => !isSubmitting && setShowKabupatenKotaModal(true)}
                style={({ pressed }) => [styles.pickerButton, { borderColor: colors.border, backgroundColor: colors.background }, pressed && styles.pressed, isSubmitting && styles.disabled]}
              >
                <View style={styles.pickerButtonContent}>
                  <Text style={[styles.pickerButtonText, { color: kabupatenKotaNama ? colors.foreground : colors.muted }]} numberOfLines={1}>
                    {kabupatenKotaNama ?? "Pilih Kabupaten/Kota"}
                  </Text>
                  <AppIcon name="chevron-right" size={18} color={colors.muted} />
                </View>
              </Pressable>
            </View>

            {/* Kecamatan Picker */}
            <View style={styles.pickerRow}>
              <Text style={[styles.pickerLabel, { color: colors.muted }]}>KECAMATAN</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Kecamatan${kecamatanNama ? `: ${kecamatanNama}` : ", belum dipilih"}`}
                disabled={!kabupatenKotaId || isSubmitting || kecamatanQuery.isLoading}
                onPress={() => !isSubmitting && kabupatenKotaId && setShowKecamatanModal(true)}
                style={({ pressed }) => [
                  styles.pickerButton,
                  { borderColor: colors.border, backgroundColor: kabupatenKotaId ? colors.background : colors.background, opacity: kabupatenKotaId ? 1 : 0.5 },
                  pressed && styles.pressed,
                  isSubmitting && styles.disabled,
                  !kabupatenKotaId && styles.disabled,
                ]}
              >
                <View style={styles.pickerButtonContent}>
                  <Text style={[styles.pickerButtonText, { color: kecamatanNama ? colors.foreground : colors.muted }]} numberOfLines={1}>
                    {kecamatanNama ?? (kabupatenKotaId ? (kecamatanQuery.isLoading ? "Memuat..." : "Pilih Kecamatan") : "Pilih Kabupaten/Kota terlebih dahulu")}
                  </Text>
                  {kecamatanQuery.isLoading && <ActivityIndicator color={colors.primary} size="small" />}
                  {!kecamatanQuery.isLoading && <AppIcon name="chevron-right" size={18} color={colors.muted} />}
                </View>
              </Pressable>
            </View>

            {/* Desa Picker */}
            <View style={styles.pickerRow}>
              <Text style={[styles.pickerLabel, { color: colors.muted }]}>DESA / KELURAHAN</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Desa${desaNama ? `: ${desaNama}` : ", belum dipilih"}`}
                disabled={!kecamatanId || isSubmitting || desaQuery.isLoading}
                onPress={() => !isSubmitting && kecamatanId && setShowDesaModal(true)}
                style={({ pressed }) => [
                  styles.pickerButton,
                  { borderColor: colors.border, backgroundColor: kecamatanId ? colors.background : colors.background, opacity: kecamatanId ? 1 : 0.5 },
                  pressed && styles.pressed,
                  isSubmitting && styles.disabled,
                  !kecamatanId && styles.disabled,
                ]}
              >
                <View style={styles.pickerButtonContent}>
                  <Text style={[styles.pickerButtonText, { color: desaNama ? colors.foreground : colors.muted }]} numberOfLines={1}>
                    {desaNama ?? (kecamatanId ? (desaQuery.isLoading ? "Memuat..." : "Pilih Desa/Kelurahan") : "Pilih Kecamatan terlebih dahulu")}
                  </Text>
                  {desaQuery.isLoading && <ActivityIndicator color={colors.primary} size="small" />}
                  {!desaQuery.isLoading && <AppIcon name="chevron-right" size={18} color={colors.muted} />}
                </View>
              </Pressable>
            </View>

            {/* Location Picker Modals */}
            <LocationPickerModal
              visible={showKabupatenKotaModal}
              title="Pilih Kabupaten / Kota"
              items={kabupatenKotaQuery.data?.map((k) => ({ id: k.id, nama: k.nama })) ?? []}
              selectedId={kabupatenKotaId}
              onSelect={handleKabupatenKotaSelect}
              onClose={() => setShowKabupatenKotaModal(false)}
              colors={colors}
            />
            <LocationPickerModal
              visible={showKecamatanModal}
              title="Pilih Kecamatan"
              items={kecamatanQuery.data?.map((k) => ({ id: k.id, nama: k.nama })) ?? []}
              selectedId={kecamatanId}
              onSelect={handleKecamatanSelect}
              onClose={() => setShowKecamatanModal(false)}
              colors={colors}
            />
            <LocationPickerModal
              visible={showDesaModal}
              title="Pilih Desa / Kelurahan"
              items={desaQuery.data?.map((d) => ({ id: d.id, nama: d.nama })) ?? []}
              selectedId={desaId}
              onSelect={handleDesaSelect}
              onClose={() => setShowDesaModal(false)}
              colors={colors}
            />

            <View style={[styles.sectionDivider, { backgroundColor: colors.border, marginTop: 16 }]} />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>HARI KUNJUNGAN (OPSIONAL)</Text>
            <VisitDaysPicker selected={visitDays} onChange={setVisitDays} colors={colors} editable={!isSubmitting} />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>FOTO DEPAN TOKO (OPSIONAL)</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={photo ? "Ganti foto toko" : "Unggah foto toko"} onPress={() => void selectPhoto()} style={({ pressed }) => [styles.uploadCard, { borderColor: photo ? colors.success : colors.border, backgroundColor: colors.background }, pressed && styles.pressed, isSubmitting && styles.disabled]}>
              <View style={[styles.uploadIcon, { backgroundColor: `${colors.primary}16` }]}>
                <AppIcon name={photo ? "verified" : "upload"} size={23} color={photo ? colors.success : colors.primary} />
              </View>
              <View style={styles.uploadCopy}>
                <Text style={[styles.uploadTitle, { color: colors.foreground }]}>{photo ? "Foto toko dipilih" : "Unggah foto depan toko"}</Text>
                <Text style={[styles.uploadMeta, { color: colors.muted }]} numberOfLines={1}>{photo ? photo.fileName : "JPG, PNG, atau WEBP · maksimal 10 MB"}</Text>
                {photo ? <Text style={[styles.uploadAction, { color: colors.primary }]}>Ketuk untuk mengganti</Text> : null}
              </View>
            </Pressable>

            <View style={styles.kodeRow}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>KODE TOKO</Text>
              <Text style={[styles.kodeAutoText, { color: colors.muted }]}>{initial?.kode ?? "Dibuat otomatis (contoh: OUT-XXXXXX). Tidak dapat diisi manual."}</Text>
              <Text style={[styles.hintText, { color: colors.muted }]}>Status: Aktif · Radius GPS: 100 m (default)</Text>
            </View>

            {displayError ? <Text style={[styles.formError, { color: colors.error }]}>{displayError}</Text> : null}
            <Pressable accessibilityRole="button" onPress={submit} style={({ pressed }) => [styles.addButton, { backgroundColor: isSubmitting ? colors.muted : colors.primary, marginTop: 18 }, pressed && styles.pressed]}>
              <Text style={styles.addButtonText}>{isSubmitting ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Outlet"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={isSubmitting ? undefined : onBack} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.border, alignSelf: "center" }, pressed && styles.pressed, isSubmitting && styles.disabled]}>
              <Text style={[styles.outlineButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

// Modal-based picker component for location hierarchy
function LocationPickerModal({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  colors,
}: {
  visible: boolean;
  title: string;
  items: Array<{ id: string; nama: string }>;
  selectedId: string | null;
  onSelect: (id: string | null, nama: string | null) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  if (!visible) return null;
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{title}</Text>
          <Pressable onPress={onClose} style={styles.modalCloseButton}>
            <AppIcon name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.modalListContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item.id, item.nama);
                onClose();
              }}
              style={({ pressed }) => [
                styles.modalItem,
                { backgroundColor: pressed ? colors.background : colors.surface },
                selectedId === item.id && { backgroundColor: `${colors.primary}16` },
              ]}
            >
              <View style={styles.modalItemContent}>
                <Text style={[
                  styles.modalItemText,
                  { color: selectedId === item.id ? colors.primary : colors.foreground }
                ]}>
                  {item.nama}
                </Text>
                {selectedId === item.id && <AppIcon name="verified" size={18} color={colors.primary} />}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.modalEmpty}>
              <Text style={[styles.modalEmptyText, { color: colors.muted }]}>Tidak ada data</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingTop: 8 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, marginLeft: 14 },
  headerIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: "800", marginTop: 2 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 16 },
  successCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12, gap: 10 },
  successCopy: { flex: 1 },
  successTitle: { fontSize: 13, fontWeight: "800" },
  successMeta: { fontSize: 11, marginTop: 3 },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13, marginBottom: 14 },
  addButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  searchInput: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, marginTop: 3 },
  refreshButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: 28 },
  emptyContent: { flexGrow: 1, paddingBottom: 28 },
  rowCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, minHeight: 56 },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, marginLeft: 10, marginRight: 8 },
  rowName: { fontSize: 13.5, lineHeight: 18, fontWeight: "800" },
  rowCode: { fontSize: 10.5, lineHeight: 14, fontWeight: "700", marginTop: 2 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  rowIconButton: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  detailCard: { borderWidth: 1, borderRadius: 20, marginTop: 8, overflow: "hidden" },
  detailPhoto: { width: "100%", height: 110 },
  detailPhotoFallback: { width: "100%", height: 85, alignItems: "center", justifyContent: "center", gap: 6 },
  fotoPlaceholderText: { fontSize: 12, fontWeight: "600" },
  cardBody: { paddingHorizontal: 13, paddingTop: 12, paddingBottom: 10 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  storeName: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "800" },
  storeCode: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  statusPill: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  sectionDivider: { height: 1, marginVertical: 14 },
  sectionHeaderTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, marginBottom: 8 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  infoIconWrapper: { width: 22, alignItems: "center", marginTop: 1 },
  infoIcon: { fontSize: 14 },
  infoIconDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#888" },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.4 },
  infoValue: { fontSize: 12.5, lineHeight: 18, fontWeight: "600", marginTop: 1 },
  editButtonContainer: { marginTop: 18, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#eee" },
  editButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 11, backgroundColor: "#f0f0f0" },
  editButtonLabel: { fontSize: 12, fontWeight: "800" },
  networkLoading: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  networkLoadingText: { fontSize: 12.5, fontWeight: "600" },
  networkError: { paddingVertical: 8 },
  networkErrorText: { fontSize: 12.5, fontWeight: "600" },
  center: { flex: 1, minHeight: 180, alignItems: "center", justifyContent: "center" },
  stateCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: "center", justifyContent: "center", marginTop: 12 },
  stateTitle: { fontSize: 15, fontWeight: "800", marginTop: 12, textAlign: "center" },
  stateText: { fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: "center" },
  outlineButton: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9, marginTop: 14 },
  outlineButtonText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
  detailContent: { paddingBottom: 32 },
  formContent: { paddingBottom: 32 },
  formCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 8 },
  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 14, marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, fontSize: 13 },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  gpsRow: { flexDirection: "row", gap: 10 },
  gpsInput: { flex: 1 },
  hintText: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  uploadCard: { minHeight: 72, borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  uploadIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  uploadCopy: { flex: 1 },
  uploadTitle: { fontSize: 13, fontWeight: "800" },
  uploadMeta: { fontSize: 11, marginTop: 3 },
  uploadAction: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  kodeRow: { marginTop: 14 },
  kodeAutoText: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  formError: { fontSize: 12, marginTop: 10 },
  iconButton: { width: 30, height: 30, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  visitDaysPicker: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, marginBottom: 4 },
  dayChip: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minWidth: 50 },
  dayChipText: { fontSize: 12, fontWeight: "600" },
  emptyVisitDays: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  visitDaysDisplay: { fontSize: 12.5, lineHeight: 18, fontWeight: "600", marginTop: 4 },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, marginBottom: 4 },
  pickerLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, width: 120 },
  pickerButton: { flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, minHeight: 48 },
  pickerButtonContent: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerButtonText: { fontSize: 13, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalContainer: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%", flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "#EEE" },
  modalTitle: { fontSize: 16, fontWeight: "800" },
  modalCloseButton: { padding: 4 },
  modalListContent: { padding: 8 },
  modalItem: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  modalItemContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalItemText: { fontSize: 15, fontWeight: "600" },
  modalEmpty: { padding: 32, alignItems: "center" },
  modalEmptyText: { fontSize: 14 },
});