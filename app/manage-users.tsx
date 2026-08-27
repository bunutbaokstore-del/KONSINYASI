import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { APP_ROLES, MANAGED_ROLES, ROLE_LABELS, type AppRole } from "@/shared/auth";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  const users = (usersQuery.data ?? []) as ManagedUser[];

  const roleOptions = useMemo(() => availableRoles, [availableRoles]);

  function closeForm() {
    setFormVisible(false);
    setEditingUser(null);
    setName("");
    setEmail("");
    setPassword("");
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
    if (!editingUser && password.length < 8) {
      setFormError("Password login minimal 8 karakter.");
      return;
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

    await createUser.mutateAsync({
      name: normalizedName,
      email: normalizedEmail,
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
            <Text style={[styles.label, { color: colors.foreground }]}>Nama lengkap</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Nama pengguna" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Email login</Text>
            <TextInput value={email} onChangeText={setEmail} editable={!editingUser || editingUser.id !== currentUserId} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="nama@perusahaan.com" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
            {!editingUser ? (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>Password login</Text>
                <PasswordInput value={password} onChangeText={setPassword} placeholder="Minimal 8 karakter" placeholderTextColor={colors.muted} colors={{ ...colors, surface: colors.background }} />
                <Text style={[styles.helper, { color: colors.muted }]}>Sampaikan password ini melalui jalur pribadi. Password ini digunakan untuk login seterusnya dan tidak dapat dilihat kembali setelah akun dibuat.</Text>
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
  formCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginTop: 14 },
  formHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  formTitle: { fontSize: 18, fontWeight: "800" },
  label: { fontSize: 12, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 14 },
  helper: { fontSize: 11, lineHeight: 16, marginTop: 6 },
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
