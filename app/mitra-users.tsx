import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { ROLE_LABELS } from "@/shared/auth";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

export default function MitraUsersScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "distributor";
  const usersQuery = trpc.management.list.useQuery(undefined, {
    enabled: canManage && isAuthenticated,
  });
  const mitras = (usersQuery.data ?? []).filter((item) => item.role === "mitra_umkm");

  useEffect(() => {
    if (!loading && (!isAuthenticated || !canManage)) {
      router.replace("/(tabs)");
    }
  }, [canManage, isAuthenticated, loading, router]);

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
        <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
          <AppIcon name="chevron-left" size={21} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG OPERASIONAL</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Daftar Mitra UMKM</Text>
        </View>
      </View>

      <Text style={[styles.subtitle, { color: colors.muted }]}>Daftar Mitra UMKM dalam ruang kerja tenant Anda.</Text>

      {usersQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : usersQuery.error ? (
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.infoText, { color: colors.error }]}>{usersQuery.error.message}</Text>
        </View>
      ) : (
        <FlatList
          data={mitras}
          keyExtractor={(item) => item.id}
          contentContainerStyle={mitras.length ? styles.list : styles.emptyList}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: `${colors.primary}16` }]}>
                <AppIcon name="person" size={20} color={colors.primary} />
              </View>
              <View style={styles.userCopy}>
                <Text style={[styles.userName, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.userEmail, { color: colors.muted }]}>{item.email}</Text>
                <Text style={[styles.userRole, { color: colors.primary }]}>{ROLE_LABELS.mitra_umkm}</Text>
              </View>
              <Text style={[styles.status, { color: item.status === "active" ? colors.success : colors.muted }]}>{item.status === "active" ? "Aktif" : "Nonaktif"}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <AppIcon name="group" size={28} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Belum ada Mitra UMKM</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>Mitra UMKM yang terdaftar di ruang kerja ini akan tampil di sini.</Text>
            </View>
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingTop: 8 },
  backButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, marginLeft: 14 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "800", marginTop: 3 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 18, marginBottom: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingBottom: 28, gap: 12 },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  userCard: { minHeight: 78, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 18, padding: 14 },
  avatar: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  userCopy: { flex: 1, marginLeft: 12 },
  userName: { fontSize: 15, fontWeight: "800" },
  userEmail: { fontSize: 12, marginTop: 3 },
  userRole: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  status: { fontSize: 11, fontWeight: "800" },
  infoCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  infoText: { fontSize: 13, lineHeight: 19 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 24, alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "800", marginTop: 12 },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6 },
  pressed: { opacity: 0.78 },
});
