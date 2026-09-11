import { AdminRouteGuard } from "@/components/admin-route-guard";
import { AppIcon } from "@/components/ui/app-icon";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type ScreenView = "list" | "create" | "detail";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waktu tidak tersedia";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminWilayahScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [view, setView] = useState<ScreenView>("list");
  const [search, setSearch] = useState("");
  const [selectedWilayahId, setSelectedWilayahId] = useState<string | null>(null);

  const listQuery = trpc.distribution.listWilayah.useQuery(undefined, { enabled: isAuthenticated });
  const detailQuery = trpc.distribution.getWilayah.useQuery(
    { wilayahId: selectedWilayahId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: isAuthenticated && Boolean(selectedWilayahId) },
  );
  const createMutation = trpc.distribution.createWilayah.useMutation({
    onSuccess: async (wilayah) => {
      await utils.distribution.listWilayah.invalidate();
      setSelectedWilayahId(wilayah.id);
      setView("detail");
    },
  });

  const filtered = (listQuery.data ?? []).filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.kode.toLowerCase().includes(q) || item.nama.toLowerCase().includes(q);
  });

  if (view === "create") {
    return (
      <AdminRouteGuard>
        <WilayahFormScreen
          mode="create"
          initial={{ kode: "", nama: "", keterangan: "" }}
          onBack={() => setView("list")}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      </AdminRouteGuard>
    );
  }

  if (view === "detail" && selectedWilayahId) {
    return (
      <AdminRouteGuard>
        <WilayahDetailContent
          wilayahId={selectedWilayahId}
          detailQuery={detailQuery}
          onBack={() => {
            setSelectedWilayahId(null);
            setView("list");
          }}
          onOpenRute={(ruteId) => router.push(`/admin/rute?ruteId=${ruteId}` as never)}
          onAddedRute={() => {
            void utils.distribution.getWilayah.invalidate();
            void utils.distribution.listWilayah.invalidate();
          }}
          onMutate={() => {
            void utils.distribution.getWilayah.invalidate();
            void utils.distribution.listWilayah.invalidate();
          }}
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
                  <Text style={[styles.title, { color: colors.foreground }]}>Wilayah</Text>
                </View>
                <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="map" size={21} color={colors.primary} /></View>
              </View>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Kelola wilayah, rute, outlet, dan penugasan Sales Motoris dalam workspace Anda.</Text>
              <Pressable accessibilityRole="button" onPress={() => setView("create")} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <AppIcon name="add" size={18} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Tambah Wilayah</Text>
              </Pressable>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Cari kode atau nama wilayah"
                placeholderTextColor={colors.muted}
                returnKeyType="search"
                style={[styles.searchInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
              />
              <View style={styles.sectionHeader}>
                <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daftar Wilayah</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{filtered.length} wilayah ditemukan</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Muat ulang wilayah" onPress={() => void listQuery.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={18} color={colors.primary} /></Pressable>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Buka ${item.nama}`} onPress={() => { setSelectedWilayahId(item.id); setView("detail"); }} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
              <View style={[styles.cardIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="map" size={21} color={colors.primary} /></View>
              <View style={styles.cardCopy}>
                <View style={styles.cardTitleRow}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{item.nama}</Text>
                  <Text style={[styles.kodeText, { color: colors.muted }]}>{item.kode}</Text>
                </View>
                <View style={styles.countRow}>
                  <CountPill label="Rute" value={item.ruteCount} color={colors.primary} muted={colors.muted} />
                  <CountPill label="Outlet" value={item.outletCount} color={colors.success} muted={colors.muted} />
                  <CountPill label="Sales" value={item.salesCount} color={colors.muted} muted={colors.muted} />
                </View>
              </View>
              <View style={styles.cardAside}>
                <Text style={[styles.statusText, { color: item.isActive ? colors.success : colors.muted }]}>{item.isActive ? "Aktif" : "Nonaktif"}</Text>
                <AppIcon name="chevron-right" size={18} color={colors.muted} />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            listQuery.isLoading ? <View style={styles.center}><ActivityIndicator color={colors.primary} /></View> : listQuery.error ? (
              <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppIcon name="map" size={28} color={colors.error} /><Text style={[styles.stateTitle, { color: colors.foreground }]}>Wilayah belum dapat dimuat</Text><Text style={[styles.stateText, { color: colors.muted }]}>{listQuery.error.message}</Text><Pressable accessibilityRole="button" onPress={() => void listQuery.refetch()} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.outlineButtonText, { color: colors.primary }]}>Coba lagi</Text></Pressable></View>
            ) : <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppIcon name="map" size={28} color={colors.muted} /><Text style={[styles.stateTitle, { color: colors.foreground }]}>Belum ada wilayah</Text><Text style={[styles.stateText, { color: colors.muted }]}>{search.trim() ? "Tidak ada wilayah yang cocok dengan pencarian." : "Tambahkan wilayah pertama untuk mulai mengatur rute."}</Text></View>
          }
        />
      </ScreenContainer>
    </AdminRouteGuard>
  );
}

function CountPill({ label, value, color, muted }: { label: string; value: number; color: string; muted: string }) {
  return (
    <View style={[styles.countPill, { backgroundColor: `${color}16` }]}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={[styles.countLabel, { color: muted }]}>{label}</Text>
    </View>
  );
}

type WilayahFormValues = { kode: string; nama: string; keterangan: string };
type WilayahFormScreenProps = {
  mode: "create" | "edit";
  initial: WilayahFormValues;
  onBack: () => void;
  onSubmit: (input: { kode: string; nama: string; keterangan?: string | null }) => void;
};

function WilayahFormScreen({ mode, initial, onBack, onSubmit }: WilayahFormScreenProps) {
  const colors = useColors();
  const [kode, setKode] = useState(initial.kode);
  const [nama, setNama] = useState(initial.nama);
  const [keterangan, setKeterangan] = useState(initial.keterangan);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const kodeTrim = kode.trim();
    const namaTrim = nama.trim();
    const keteranganTrim = keterangan.trim();
    if (!kodeTrim || !namaTrim) {
      setError("Kode dan nama wilayah wajib diisi.");
      return;
    }
    setError(null);
    onSubmit({ kode: kodeTrim, nama: namaTrim, keterangan: keteranganTrim || null });
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
        <View>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={onBack} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
              <AppIcon name="chevron-left" size={21} color={colors.foreground} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>DISTRIBUSI</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>{mode === "create" ? "Tambah Wilayah" : "Ubah Wilayah"}</Text>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Kode wilayah harus unik dalam workspace ini.</Text>
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>KODE</Text>
            <TextInput value={kode} onChangeText={setKode} placeholder="contoh: JKT-01" placeholderTextColor={colors.muted} autoCapitalize="characters" style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA</Text>
            <TextInput value={nama} onChangeText={setNama} placeholder="contoh: Jakarta Barat" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>KETERANGAN (OPSIONAL)</Text>
            <TextInput value={keterangan} onChangeText={setKeterangan} placeholder="Catatan singkat tentang wilayah ini" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            {error ? <Text style={[styles.formError, { color: colors.error }]}>{error}</Text> : null}
            <Pressable accessibilityRole="button" onPress={submit} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary, marginTop: 18 }, pressed && styles.pressed]}>
              <Text style={styles.addButtonText}>{mode === "create" ? "Simpan Wilayah" : "Simpan Perubahan"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.border, alignSelf: "center" }, pressed && styles.pressed]}>
              <Text style={[styles.outlineButtonText, { color: colors.muted }]}>Batal</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function WilayahDetailContent({ wilayahId, detailQuery, onBack, onOpenRute, onAddedRute, onMutate }: {
  wilayahId: string;
  detailQuery: { isLoading: boolean; error: { message: string } | null; data?: { wilayah: { id: string; kode: string; nama: string; keterangan: string | null; isActive: boolean; createdAt: string; updatedAt: string }; rutes: { id: string; kode: string; nama: string; keterangan: string | null; isActive: boolean; outletCount: number; salesCount: number }[] } | null; refetch: () => Promise<unknown> };
  onBack: () => void;
  onOpenRute: (ruteId: string) => void;
  onAddedRute: () => void;
  onMutate: () => void;
}) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const [addingRute, setAddingRute] = useState(false);
  const [formKode, setFormKode] = useState("");
  const [formNama, setFormNama] = useState("");
  const [formKeterangan, setFormKeterangan] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const setActiveMutation = trpc.distribution.setWilayahActive.useMutation();
  const updateMutation = trpc.distribution.updateWilayah.useMutation({
    onSuccess: () => {
      setEditing(false);
      onMutate();
    },
  });

  const createRuteMutation = trpc.distribution.createRute.useMutation({
    onSuccess: () => {
      setFormKode("");
      setFormNama("");
      setFormKeterangan("");
      setAddingRute(false);
      onAddedRute();
    },
  });

  const saveRute = () => {
    const kodeTrim = formKode.trim();
    const namaTrim = formNama.trim();
    if (!kodeTrim || !namaTrim) {
      setFormError("Kode dan nama rute wajib diisi.");
      return;
    }
    setFormError(null);
    createRuteMutation.mutate({ wilayahId, kode: kodeTrim, nama: namaTrim, keterangan: formKeterangan.trim() || null });
  };

  const data = detailQuery.data;
  const loading = detailQuery.isLoading || (!data && !detailQuery.error);

  if (loading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke daftar wilayah" onPress={onBack} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
            <AppIcon name="chevron-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>DETAIL WILAYAH</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Wilayah</Text>
          </View>
        </View>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </ScreenContainer>
    );
  }

  if (!data) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke daftar wilayah" onPress={onBack} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
            <AppIcon name="chevron-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>DETAIL WILAYAH</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Wilayah</Text>
          </View>
        </View>
        <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppIcon name="map" size={28} color={colors.error} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Detail belum dapat dimuat</Text>
          <Text style={[styles.stateText, { color: colors.muted }]}>{detailQuery.error?.message ?? "Wilayah tidak ditemukan."}</Text>
          <Pressable accessibilityRole="button" onPress={() => void detailQuery.refetch()} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.outlineButtonText, { color: colors.primary }]}>Coba lagi</Text></Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
      <View>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke daftar wilayah" onPress={onBack} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
            <AppIcon name="chevron-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>DETAIL WILAYAH</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Wilayah</Text>
          </View>
        </View>
      </View>
      <View>
        <View style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.detailHeaderRow}>
            <View style={[styles.detailIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="map" size={25} color={colors.primary} /></View>
            <View style={styles.detailTitleCopy}>
              <Text style={[styles.detailName, { color: colors.foreground }]}>{data.wilayah.nama}</Text>
              <Text style={[styles.kodeText, { color: colors.muted }]}>{data.wilayah.kode}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Ubah wilayah" onPress={() => { setEditing((value) => !value); setFormKode(data.wilayah.kode); setFormNama(data.wilayah.nama); setFormKeterangan(data.wilayah.keterangan ?? ""); }} style={({ pressed }) => [styles.iconButton, { borderColor: colors.border }, pressed && styles.pressed]}>
              <AppIcon name="edit" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.detailSubRow}>
            <View style={[styles.statusPill, { backgroundColor: data.wilayah.isActive ? `${colors.success}18` : `${colors.muted}18` }]}>
              <Text style={[styles.statusText, { color: data.wilayah.isActive ? colors.success : colors.muted }]}>{data.wilayah.isActive ? "Aktif" : "Nonaktif"}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setActiveMutation.mutate({ wilayahId, isActive: !data.wilayah.isActive }, { onSuccess: onMutate })} style={({ pressed }) => [styles.outlineButton, { borderColor: colors.border, marginTop: 0, paddingVertical: 6 }, pressed && styles.pressed]}>
              <Text style={[styles.outlineButtonText, { color: colors.muted }]}>{data.wilayah.isActive ? "Nonaktifkan" : "Aktifkan"}</Text>
            </Pressable>
          </View>
          {data.wilayah.keterangan ? <Text style={[styles.detailNote, { color: colors.muted }]}>{data.wilayah.keterangan}</Text> : null}
          <DetailRow label="Dibuat" value={formatDate(data.wilayah.createdAt)} colors={colors} />
          <DetailRow label="Diperbarui" value={formatDate(data.wilayah.updatedAt)} colors={colors} />
        </View>
        {editing ? (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Ubah Wilayah</Text>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>KODE</Text>
            <TextInput value={formKode} onChangeText={setFormKode} placeholder="contoh: JKT-01" placeholderTextColor={colors.muted} autoCapitalize="characters" style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA</Text>
            <TextInput value={formNama} onChangeText={setFormNama} placeholder="contoh: Jakarta Barat" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>KETERANGAN (OPSIONAL)</Text>
            <TextInput value={formKeterangan} onChangeText={setFormKeterangan} placeholder="Catatan singkat" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Pressable accessibilityRole="button" onPress={() => {
              const kodeTrim = formKode.trim();
              const namaTrim = formNama.trim();
              if (!kodeTrim || !namaTrim) { setFormError("Kode dan nama wilayah wajib diisi."); return; }
              setFormError(null);
              updateMutation.mutate({ wilayahId, kode: kodeTrim, nama: namaTrim, keterangan: formKeterangan.trim() || null });
            }} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary, marginTop: 14 }, pressed && styles.pressed]}>
              <Text style={styles.addButtonText}>Simpan Perubahan</Text>
            </Pressable>
            {updateMutation.error ? <Text style={[styles.formError, { color: colors.error }]}>{updateMutation.error.message}</Text> : null}
          </View>
        ) : null}
        <View style={styles.sectionHeader}>
          <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Daftar Rute</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{data.rutes.length} rute dalam wilayah ini</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Tambah rute" onPress={() => setAddingRute((value) => !value)} style={({ pressed }) => [styles.addSmallButton, { backgroundColor: `${colors.primary}16`, borderColor: colors.primary }, pressed && styles.pressed]}>
            <AppIcon name="add" size={16} color={colors.primary} />
            <Text style={[styles.addSmallText, { color: colors.primary }]}>Rute</Text>
          </Pressable>
        </View>
        {addingRute ? (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>KODE</Text>
            <TextInput value={formKode} onChangeText={setFormKode} placeholder="contoh: R-01" placeholderTextColor={colors.muted} autoCapitalize="characters" style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>NAMA</Text>
            <TextInput value={formNama} onChangeText={setFormNama} placeholder="contoh: Rute Cengkareng" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>KETERANGAN (OPSIONAL)</Text>
            <TextInput value={formKeterangan} onChangeText={setFormKeterangan} placeholder="Catatan singkat" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.textarea, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />
            {formError ? <Text style={[styles.formError, { color: colors.error }]}>{formError}</Text> : null}
            {createRuteMutation.error ? <Text style={[styles.formError, { color: colors.error }]}>{createRuteMutation.error.message}</Text> : null}
            <Pressable accessibilityRole="button" onPress={saveRute} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary, marginTop: 14 }, pressed && styles.pressed]}>
              <Text style={styles.addButtonText}>Simpan Rute</Text>
            </Pressable>
          </View>
        ) : null}
        {data.rutes.map((rute) => (
          <Pressable key={rute.id} accessibilityRole="button" accessibilityLabel={`Buka ${rute.nama}`} onPress={() => onOpenRute(rute.id)} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
            <View style={[styles.cardIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="shippingbox" size={21} color={colors.primary} /></View>
            <View style={styles.cardCopy}>
              <View style={styles.cardTitleRow}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{rute.nama}</Text>
                <Text style={[styles.kodeText, { color: colors.muted }]}>{rute.kode}</Text>
              </View>
              <View style={styles.countRow}>
                <CountPill label="Outlet" value={rute.outletCount} color={colors.success} muted={colors.muted} />
                <CountPill label="Sales" value={rute.salesCount} color={colors.muted} muted={colors.muted} />
              </View>
            </View>
            <View style={styles.cardAside}>
              <Text style={[styles.statusText, { color: rute.isActive ? colors.success : colors.muted }]}>{rute.isActive ? "Aktif" : "Nonaktif"}</Text>
              <AppIcon name="chevron-right" size={18} color={colors.muted} />
            </View>
          </Pressable>
        ))}
        {data.rutes.length === 0 && !addingRute ? (
          <View style={[styles.stateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppIcon name="shippingbox" size={28} color={colors.muted} />
            <Text style={[styles.stateTitle, { color: colors.foreground }]}>Belum ada rute</Text>
            <Text style={[styles.stateText, { color: colors.muted }]}>Tambahkan rute pertama untuk mulai menugaskan outlet dan Sales.</Text>
          </View>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.detailRow, { borderBottomColor: colors.border }]}><Text style={[styles.detailLabel, { color: colors.muted }]}>{label}</Text><Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingTop: 8 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, marginLeft: 14 },
  headerIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: "800", marginTop: 2 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 16 },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 13, marginBottom: 14 },
  addButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  addSmallButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  addSmallText: { fontSize: 12, fontWeight: "800" },
  searchInput: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, marginTop: 3 },
  refreshButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: 28 },
  emptyContent: { flexGrow: 1, paddingBottom: 28 },
  card: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  cardIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardCopy: { flex: 1, marginLeft: 12, marginRight: 8 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  kodeText: { fontSize: 11, fontWeight: "700" },
  countRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  countPill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4 },
  countValue: { fontSize: 12, fontWeight: "800" },
  countLabel: { fontSize: 10, fontWeight: "600" },
  cardAside: { alignItems: "flex-end", gap: 9 },
  statusText: { fontSize: 11, fontWeight: "800" },
  center: { flex: 1, minHeight: 180, alignItems: "center", justifyContent: "center" },
  stateCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: "center", justifyContent: "center", marginTop: 12 },
  stateTitle: { fontSize: 15, fontWeight: "800", marginTop: 12, textAlign: "center" },
  stateText: { fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: "center" },
  outlineButton: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9, marginTop: 14 },
  outlineButtonText: { fontSize: 12, fontWeight: "800" },
  iconButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  detailCard: { borderWidth: 1, borderRadius: 20, padding: 18, marginTop: 20 },
  detailHeaderRow: { flexDirection: "row", alignItems: "center" },
  detailIcon: { width: 50, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  detailTitleCopy: { flex: 1, marginLeft: 12 },
  detailName: { fontSize: 20, lineHeight: 26, fontWeight: "800" },
  detailSubRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  statusPill: { alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  detailNote: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, paddingVertical: 12, marginTop: 4 },
  detailLabel: { fontSize: 12 },
  detailValue: { flex: 1, fontSize: 12, fontWeight: "700", textAlign: "right" },
  formContent: { paddingBottom: 32 },
  formCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 8 },
  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, marginTop: 14, marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, fontSize: 13 },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  formError: { fontSize: 12, marginTop: 10 },
});