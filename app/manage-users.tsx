import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { APP_ROLES, MANAGED_ROLES, ROLE_LABELS, type AppRole } from "@/shared/auth";
import { trpc } from "@/lib/trpc";
import { isValidPhone, isValidProfileAddress, isValidProfileName, normalizePhone, type KtpUpload } from "@/shared/user-profile";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  roleLabel: string;
  status: "active" | "disabled";
};

export default function ManageUsersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const currentRole = user?.role ?? "mitra_umkm";
  const currentUserId = user?.id ?? "";
  const canManage = currentRole === "distributor" || currentRole === "admin";
  const availableRoles = currentRole === "distributor" ? APP_ROLES.filter((item) => item !== "distributor") : MANAGED_ROLES;
  const [formVisible, setFormVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactRelation, setEmergencyContactRelation] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [ktpUpload, setKtpUpload] = useState<KtpUpload | null>(null);
  const [role, setRole] = useState<AppRole>(currentRole === "admin" ? "mitra_umkm" : "admin");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!isAuthenticated || !canManage)) {
      router.replace("/(tabs)");
    }
  }, [canManage, isAuthenticated, loading, router]);

  const usersQuery = trpc.management.list.useQuery(undefined, {
    enabled: canManage && isAuthenticated,
  });
  const createUser = trpc.management.create.useMutation({
    onSuccess: async () => {
      closeForm();
      await usersQuery.refetch();
    },
  });
  const updateUser = trpc.management.update.useMutation({
    onSuccess: async () => {
      closeForm();
      await usersQuery.refetch();
    },
  });
  const deleteUser = trpc.management.remove.useMutation({
    onSuccess: async () => {
      await usersQuery.refetch();
    },
  });
  const mutationError = createUser.error?.message ?? updateUser.error?.message ?? deleteUser.error?.message;
  const busy = createUser.isPending || updateUser.isPending || deleteUser.isPending;
  const users = useMemo(() => (usersQuery.data ?? []) as ManagedUser[], [usersQuery.data]);

  const roleOptions = useMemo(() => availableRoles, [availableRoles]);

  function closeForm() {
    setFormVisible(false);
    setEditingUser(null);
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setPhone("");
    setEmergencyContactName("");
    setEmergencyContactRelation("");
    setEmergencyContactPhone("");
    setAddress("");
    setKtpUpload(null);
    setStatus("active");
    setRole(currentRole === "admin" ? "mitra_umkm" : "admin");
    setFormError(null);
  }

  function openCreate() {
    closeForm();
    setFormVisible(true);
  }

  function openEdit(item: ManagedUser) {
    setEditingUser(item);
    setFormVisible(true);
    setName(item.name);
    setEmail(item.email);
    setRole(item.role);
    setStatus(item.status);
    setPassword("");
    setFormError(null);
  }

  async function selectKtp() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 10],
        quality: 0.75,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) {
        setFormError("Foto KTP belum dapat dibaca. Silakan pilih foto lain.");
        return;
      }
      if ((asset.fileSize ?? 0) > 5 * 1024 * 1024) {
        setFormError("Ukuran foto KTP maksimal 5 MB.");
        return;
      }
      setKtpUpload({
        uri: asset.uri,
        base64: asset.base64,
        contentType: "image/jpeg",
        originalName: asset.fileName ?? `ktp-${Date.now()}.jpg`,
        fileSize: asset.fileSize,
      });
      setFormError(null);
    } catch {
      setFormError("Foto KTP belum dapat dipilih. Coba lagi.");
    }
  }

  async function submitForm() {
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedName.length < 2) {
      setFormError("Masukkan nama minimal 2 karakter.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setFormError("Masukkan email login yang valid.");
      return;
    }
    if (!editingUser) {
      if (!isValidPhone(phone)) {
        setFormError("Masukkan nomor HP yang valid.");
        return;
      }
      if (!isValidProfileName(emergencyContactName)) {
        setFormError("Masukkan nama kontak darurat.");
        return;
      }
      if (emergencyContactRelation.trim().length < 2) {
        setFormError("Masukkan hubungan kontak darurat.");
        return;
      }
      if (!isValidPhone(emergencyContactPhone)) {
        setFormError("Masukkan nomor HP kontak darurat yang valid.");
        return;
      }
      if (!isValidProfileAddress(address)) {
        setFormError("Masukkan alamat lengkap minimal 10 karakter.");
        return;
      }
      if (password.length < 8) {
        setFormError("Password login minimal 8 karakter.");
        return;
      }
      if (password !== confirmPassword) {
        setFormError("Konfirmasi password tidak sama.");
        return;
      }
      if (!ktpUpload) {
        setFormError("Foto KTP wajib diunggah untuk semua role.");
        return;
      }
    }

    setFormError(null);
    if (editingUser) {
      await updateUser.mutateAsync({
        userId: editingUser.id,
        name: normalizedName,
        email: normalizedEmail,
        role,
        status,
      });
      return;
    }

    if (!ktpUpload) return;
    await createUser.mutateAsync({
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizePhone(phone),
      emergencyContactName: emergencyContactName.trim(),
      emergencyContactRelation: emergencyContactRelation.trim(),
      emergencyContactPhone: normalizePhone(emergencyContactPhone),
      address: address.trim(),
      ktpBase64: ktpUpload.base64,
      ktpContentType: ktpUpload.contentType,
      ktpOriginalName: ktpUpload.originalName,
      password,
      role,
    });
  }

  function confirmDelete(item: ManagedUser) {
    Alert.alert(
      "Hapus pengguna?",
      `Akun ${item.email} akan dihapus permanen dari Supabase Auth.`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Hapus", style: "destructive", onPress: () => void deleteUser.mutateAsync({ userId: item.id }) },
      ],
    );
  }

  if (loading || !isAuthenticated || !canManage) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
            <AppIcon name="chevron-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>AKSES DAN TIM</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Manajemen Pengguna</Text>
          </View>
        </View>

        <View style={[styles.permissionCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}35` }]}>
          <AppIcon name="verified-user" size={21} color={colors.primary} />
          <Text style={[styles.permissionText, { color: colors.foreground }]}>
            {currentRole === "distributor" ? "Sebagai Distributor, Anda dapat mengelola semua role." : "Sebagai Admin, Anda dapat mengelola role bawahan tanpa membuat atau menghapus Distributor."}
          </Text>
        </View>

        {formVisible ? (
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.formHeader}>
              <Text style={[styles.formTitle, { color: colors.foreground }]}>{editingUser ? "Edit pengguna" : "Tambah pengguna"}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Tutup form" onPress={closeForm} style={({ pressed }) => [pressed && styles.pressed]}>
                <AppIcon name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView style={styles.formScroll} contentContainerStyle={styles.formScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.label, { color: colors.foreground }]}>Nama lengkap</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Nama pengguna" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Email login</Text>
            <TextInput value={email} onChangeText={setEmail} editable={!editingUser || editingUser.id !== currentUserId} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="nama@perusahaan.com" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
            {!editingUser ? (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>Nomor HP</Text>
                <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="08xxxxxxxxxx" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                <Text style={[styles.label, { color: colors.foreground }]}>Nama kontak darurat</Text>
                <TextInput value={emergencyContactName} onChangeText={setEmergencyContactName} placeholder="Nama kontak darurat" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                <Text style={[styles.label, { color: colors.foreground }]}>Hubungan kontak darurat</Text>
                <TextInput value={emergencyContactRelation} onChangeText={setEmergencyContactRelation} placeholder="Contoh: Suami, Istri, Orang tua" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                <Text style={[styles.label, { color: colors.foreground }]}>Nomor kontak darurat</Text>
                <TextInput value={emergencyContactPhone} onChangeText={setEmergencyContactPhone} keyboardType="phone-pad" placeholder="08xxxxxxxxxx" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                <Text style={[styles.label, { color: colors.foreground }]}>Alamat lengkap</Text>
                <TextInput value={address} onChangeText={setAddress} multiline numberOfLines={3} textAlignVertical="top" placeholder="Jalan, nomor, RT/RW, kelurahan, kecamatan, kota" placeholderTextColor={colors.muted} style={[styles.input, styles.addressInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                <Text style={[styles.label, { color: colors.foreground }]}>Foto KTP</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={ktpUpload ? "Ganti foto KTP" : "Unggah foto KTP"} onPress={() => void selectKtp()} style={({ pressed }) => [styles.uploadCard, { borderColor: ktpUpload ? colors.primary : colors.border, backgroundColor: colors.background }, pressed && styles.pressed]}>
                  {ktpUpload ? (
                    <>
                      <Image source={{ uri: ktpUpload.uri }} style={styles.ktpPreview} />
                      <View style={styles.uploadCopy}>
                        <Text style={[styles.uploadTitle, { color: colors.foreground }]}>Foto KTP dipilih</Text>
                        <Text style={[styles.uploadMeta, { color: colors.muted }]} numberOfLines={1}>{ktpUpload.originalName}</Text>
                        <Text style={[styles.uploadAction, { color: colors.primary }]}>Ketuk untuk mengganti</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={[styles.uploadIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="upload" size={23} color={colors.primary} /></View>
                      <View style={styles.uploadCopy}>
                        <Text style={[styles.uploadTitle, { color: colors.foreground }]}>Unggah foto KTP</Text>
                        <Text style={[styles.uploadMeta, { color: colors.muted }]}>JPG, PNG, atau WEBP · maksimal 5 MB</Text>
                      </View>
                    </>
                  )}
                </Pressable>
                <Text style={[styles.helper, { color: colors.muted }]}>Wajib untuk semua role. Foto disimpan secara privat dan hanya dapat diakses sesuai kewenangan.</Text>
                <Text style={[styles.label, { color: colors.foreground }]}>Password login</Text>
                <PasswordInput value={password} onChangeText={setPassword} placeholder="Minimal 8 karakter" placeholderTextColor={colors.muted} colors={{ ...colors, surface: colors.background }} />
                <Text style={[styles.label, { color: colors.foreground }]}>Konfirmasi password</Text>
                <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Ulangi password login" placeholderTextColor={colors.muted} colors={{ ...colors, surface: colors.background }} />
                <Text style={[styles.helper, { color: colors.muted }]}>Password ini digunakan untuk login seterusnya. Konfirmasi password hanya untuk pemeriksaan dan tidak disimpan.</Text>
              </>
            ) : null}
            <Text style={[styles.label, { color: colors.foreground }]}>Role</Text>
            <View style={styles.roleGrid}>
              {roleOptions.map((option) => (
                <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: role === option }} onPress={() => setRole(option)} style={[styles.roleChip, { borderColor: role === option ? colors.primary : colors.border, backgroundColor: role === option ? `${colors.primary}16` : colors.background }]}>
                  <Text style={[styles.roleChipText, { color: role === option ? colors.primary : colors.foreground }]}>{ROLE_LABELS[option]}</Text>
                </Pressable>
              ))}
            </View>
            {editingUser ? (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>Status akun</Text>
                <View style={styles.roleGrid}>
                  {(["active", "disabled"] as const).map((option) => (
                    <Pressable key={option} accessibilityRole="button" onPress={() => setStatus(option)} style={[styles.roleChip, { borderColor: status === option ? colors.primary : colors.border, backgroundColor: status === option ? `${colors.primary}16` : colors.background }]}>
                      <Text style={[styles.roleChipText, { color: status === option ? colors.primary : colors.foreground }]}>{option === "active" ? "Aktif" : "Nonaktif"}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {formError || mutationError ? <Text style={[styles.error, { color: colors.error }]}>{formError ?? mutationError}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submitForm()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed, busy && styles.disabled]}>
              {busy ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryButtonText, { color: colors.background }]}>{editingUser ? "Simpan perubahan" : "Buat akun"}</Text>}
            </Pressable>
            </ScrollView>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={openCreate} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
            <AppIcon name="add" size={21} color={colors.background} />
            <Text style={[styles.addButtonText, { color: colors.background }]}>Tambah pengguna</Text>
          </Pressable>
        )}

        <View style={styles.listHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Pengguna dalam ruang kerja</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{users.length} akun terdaftar</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Muat ulang pengguna" onPress={() => void usersQuery.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}>
            <AppIcon name="refresh" size={19} color={colors.primary} />
          </Pressable>
        </View>

        {usersQuery.isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : usersQuery.error ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.error, { color: colors.error }]}>{usersQuery.error.message}</Text></View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={[styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                <View style={[styles.avatar, { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{item.name.charAt(0).toUpperCase()}</Text></View>
                <View style={styles.userCopy}>
                  <Text style={[styles.userName, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.userEmail, { color: colors.muted }]}>{item.email}</Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.badge, { color: colors.primary, backgroundColor: `${colors.primary}16` }]}>{item.roleLabel}</Text>
                    <Text style={[styles.status, { color: item.status === "active" ? colors.success : colors.error }]}>{item.status === "active" ? "Aktif" : "Nonaktif"}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  {item.role !== "distributor" ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => openEdit(item)} style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="edit" size={17} color={colors.primary} /></Pressable> : null}
                  {item.id !== currentUserId && item.role !== "distributor" ? <Pressable accessibilityRole="button" accessibilityLabel={`Hapus ${item.name}`} onPress={() => confirmDelete(item)} style={({ pressed }) => [styles.actionButton, { borderColor: `${colors.error}45` }, pressed && styles.pressed]}><AppIcon name="delete" size={17} color={colors.error} /></Pressable> : null}
                </View>
              </View>
            )}
            ListEmptyComponent={<View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppIcon name="group" size={28} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Belum ada pengguna lain</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Tambahkan akun Admin atau role operasional untuk mulai membangun tim.</Text></View>}
          />
        )}

      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 12, gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "800", marginTop: 3 },
  permissionCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 16, padding: 13, marginTop: 18, gap: 10 },
  permissionText: { flex: 1, fontSize: 12, lineHeight: 18 },
  addButton: { minHeight: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 },
  addButtonText: { fontSize: 15, fontWeight: "800" },
  actionCards: { gap: 10, marginTop: 14 },
  actionCard: { minHeight: 76, borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  actionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1 },
  actionTitle: { fontSize: 14, fontWeight: "800" },
  actionSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  formCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 14 },
  formScroll: { maxHeight: 590 },
  formScrollContent: { paddingBottom: 2 },
  formHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  formTitle: { fontSize: 18, fontWeight: "800" },
  label: { fontSize: 12, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 14 },
  addressInput: { minHeight: 88, paddingTop: 13, paddingBottom: 13 },
  helper: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  uploadCard: { minHeight: 86, borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  uploadIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  ktpPreview: { width: 68, height: 48, borderRadius: 9, backgroundColor: "#DDE5E2" },
  uploadCopy: { flex: 1 },
  uploadTitle: { fontSize: 13, fontWeight: "800" },
  uploadMeta: { fontSize: 10, marginTop: 3 },
  uploadAction: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleChip: { minHeight: 38, borderRadius: 12, borderWidth: 1, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" },
  roleChipText: { fontSize: 12, fontWeight: "700" },
  error: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  primaryButton: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 14 },
  primaryButtonText: { fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.6 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  sectionSubtitle: { fontSize: 12, marginTop: 3 },
  refreshButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: 30, gap: 10 },
  userCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 18, padding: 13 },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "800" },
  userCopy: { flex: 1, marginLeft: 11 },
  userName: { fontSize: 14, fontWeight: "800" },
  userEmail: { fontSize: 11, marginTop: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 7 },
  badge: { fontSize: 10, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  status: { fontSize: 10, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 6, marginLeft: 8 },
  actionButton: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 22, alignItems: "center", marginTop: 4 },
  emptyTitle: { fontSize: 15, fontWeight: "800", marginTop: 10 },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
  center: { alignItems: "center", paddingVertical: 40 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
