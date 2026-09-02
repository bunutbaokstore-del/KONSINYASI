import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

export default function PlatformAdminScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const isSysAdmin = user?.platformRole === "sys_admin";
  const tenantsQuery = trpc.platform.tenants.useQuery(undefined, { enabled: isAuthenticated && isSysAdmin });

  useEffect(() => {
    if (!loading && (!isAuthenticated || !isSysAdmin)) router.replace("/(tabs)");
  }, [isAuthenticated, isSysAdmin, loading, router]);

  if (loading || !isAuthenticated || !isSysAdmin) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-5">
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}>
          <AppIcon name="chevron-left" size={21} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>PLATFORM CONTROL</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Dashboard Sysadmin</Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: `${colors.primary}16` }]}>
          <AppIcon name="verified-user" size={21} color={colors.primary} />
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}35` }]}>
        <AppIcon name="building" size={22} color={colors.primary} />
        <View style={styles.infoCopy}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>Ruang administrasi platform</Text>
          <Text style={[styles.infoText, { color: colors.muted }]}>Sysadmin mengelola tenant Distributor tanpa menjadi anggota tenant mana pun.</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tenant Distributor</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{tenantsQuery.data?.length ?? 0} tenant terdaftar</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Muat ulang tenant" onPress={() => void tenantsQuery.refetch()} style={({ pressed }) => [styles.refreshButton, { borderColor: colors.border }, pressed && styles.pressed]}>
          <AppIcon name="refresh" size={19} color={colors.primary} />
        </Pressable>
      </View>

      {tenantsQuery.error ? <Text style={[styles.errorText, { color: colors.error }]}>{tenantsQuery.error.message}</Text> : null}

      <FlatList
        data={tenantsQuery.data ?? []}
        keyExtractor={(item) => item.userId}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshing={tenantsQuery.isRefetching}
        onRefresh={() => void tenantsQuery.refetch()}
        ListEmptyComponent={tenantsQuery.isLoading ? <View style={styles.loadingBlock}><ActivityIndicator color={colors.primary} /></View> : <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppIcon name="building" size={28} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>Belum ada tenant Distributor</Text><Text style={[styles.emptyText, { color: colors.muted }]}>Tenant akan muncul setelah akun Distributor terdaftar.</Text></View>}
        renderItem={({ item }) => (
          <View style={[styles.tenantCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.tenantIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="building" size={21} color={colors.primary} /></View>
            <View style={styles.tenantCopy}>
              <Text style={[styles.tenantName, { color: colors.foreground }]}>{item.name || "Distributor"}</Text>
              <Text style={[styles.tenantEmail, { color: colors.muted }]}>{item.email}</Text>
              {item.phone ? <Text style={[styles.tenantMeta, { color: colors.muted }]}>{item.phone}</Text> : null}
            </View>
            <View style={[styles.statusBadge, { borderColor: item.status === "active" ? colors.success : colors.error }]}>
              <Text style={[styles.statusText, { color: item.status === "active" ? colors.success : colors.error }]}>{item.status === "active" ? "Aktif" : "Nonaktif"}</Text>
            </View>
          </View>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", paddingTop: 12 },
  backButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, marginLeft: 12 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { fontSize: 23, lineHeight: 29, fontWeight: "800", marginTop: 2 },
  infoCard: { flexDirection: "row", gap: 12, borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 20 },
  infoCopy: { flex: 1 },
  infoTitle: { fontSize: 14, lineHeight: 20, fontWeight: "800" },
  infoText: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { fontSize: 11, marginTop: 3 },
  refreshButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  listContent: { paddingBottom: 30 },
  tenantCard: { flexDirection: "row", alignItems: "flex-start", borderWidth: 1, borderRadius: 17, padding: 13, marginBottom: 10 },
  tenantIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  tenantCopy: { flex: 1, marginLeft: 10, paddingRight: 8 },
  tenantName: { fontSize: 14, fontWeight: "800" },
  tenantEmail: { fontSize: 11, marginTop: 4 },
  tenantMeta: { fontSize: 10, marginTop: 5 },
  statusBadge: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  statusText: { fontSize: 10, fontWeight: "800" },
  emptyCard: { borderWidth: 1, borderRadius: 17, alignItems: "center", padding: 22, marginTop: 3 },
  emptyTitle: { fontSize: 14, fontWeight: "800", marginTop: 9 },
  emptyText: { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 4 },
  loadingBlock: { paddingVertical: 30, alignItems: "center" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
