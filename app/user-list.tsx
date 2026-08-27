import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { type AppRole } from "@/shared/auth";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  roleLabel: string;
  status: "active" | "disabled";
};

export default function UserListScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const currentRole = user?.role ?? "mitra_umkm";
  const currentUserId = user?.id ?? "";
  const canManage = currentRole === "distributor" || currentRole === "admin";
  const usersQuery = trpc.management.list.useQuery(undefined, {
    enabled: canManage && isAuthenticated,
  });
  const updateUser = trpc.management.update.useMutation({
    onSuccess: async () => {
      await usersQuery.refetch();
    },
  });
  const deleteUser = trpc.management.remove.useMutation({
    onSuccess: async () => {
      await usersQuery.refetch();
    },
  });
  const users = (usersQuery.data ?? []) as ManagedUser[];
  const busy = updateUser.isPending || deleteUser.isPending;

  useEffect(() => {
    if (!loading && (!isAuthenticated || !canManage)) {
      router.replace("/(tabs)");
    }
  }, [canManage, isAuthenticated, loading, router]);

  function confirmDelete(item: ManagedUser) {
    Alert.alert(
      "Hapus pengguna?",
      `Akun ${item.email} akan dihapus permanen dari Supabase Auth dan data profilnya.`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Hapus", style: "destructive", onPress: () => void deleteUser.mutateAsync({ userId: item.id }) },
      ],
    );
  }

  function editUser(item: ManagedUser) {
    router.push({ pathname: "/manage-users", params: { editUserId: item.id } });
  }

  function toggleStatus(item: ManagedUser) {
    if (item.id === currentUserId) {
      Alert.alert("Akun sedang digunakan", "Akun yang sedang digunakan tidak dapat dinonaktifkan.");
      return;
    }
    void updateUser.mutateAsync({
      userId: item.id,
      name: item.name,
      email: item.email,
      role: item.role,
      status: item.status === "active" ? "disabled" : "active",
    });
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
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke Manajemen Pengguna" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
          <AppIcon name="chevron-left" size={21} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>AKSES DAN TIM</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Daftar Pengguna</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{users.length} akun dalam ruang kerja</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Muat ulang daftar pengguna" onPress={() => void usersQuery.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}>
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
              {item.role !== "distributor" ? (
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Ubah status ${item.name}`} disabled={busy} onPress={() => toggleStatus(item)} style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && styles.pressed, busy && styles.disabled]}>
                    <AppIcon name="verified" size={17} color={item.status === "active" ? colors.success : colors.muted} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} onPress={() => editUser(item)} style={({ pressed }) => [styles.actionButton, { borderColor: colors.border }, pressed && styles.pressed]}>
                    <AppIcon name="edit" size={17} color={colors.primary} />
                  </Pressable>
                  {item.id !== currentUserId ? <Pressable accessibilityRole="button" accessibilityLabel={`Hapus ${item.name}`} disabled={busy} onPress={() => confirmDelete(item)} style={({ pressed }) => [styles.actionButton, { borderColor: `${colors.error}45` }, pressed && styles.pressed, busy && styles.disabled]}><AppIcon name="delete" size={17} color={colors.error} /></Pressable> : null}
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={<View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppIcon name="group" size={28} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Belum ada pengguna lain</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Tambahkan akun Admin atau role operasional dari menu Tambah Pengguna.</Text></View>}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingTop: 12, gap: 12, marginBottom: 16 },
  backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "800", marginTop: 3 },
  subtitle: { fontSize: 12, marginTop: 3 },
  refreshButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", paddingVertical: 40 },
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
  actions: { flexDirection: "row", gap: 5, marginLeft: 7 },
  actionButton: { width: 33, height: 33, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 22, alignItems: "center", marginTop: 4 },
  emptyTitle: { fontSize: 15, fontWeight: "800", marginTop: 10 },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5 },
  error: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
});
