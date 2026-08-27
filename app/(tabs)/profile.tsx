import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace("/(tabs)");
  }, [isAuthenticated, loading, router]);

  if (loading || !isAuthenticated) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  const name = user?.name?.trim() || "Pengguna KONSINYASI";
  const initial = name.charAt(0).toUpperCase();

  return (
    <ScreenContainer className="px-6">
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>AKUN SAYA</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Profil pengguna</Text>

        <View style={[styles.profileCard, { backgroundColor: colors.primary }]}>
          <View style={[styles.avatar, { backgroundColor: colors.background }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initial}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={[styles.name, { color: colors.background }]}>{name}</Text>
            <Text style={[styles.email, { color: "#D9EFE5" }]}>{user?.email || "Email belum tersedia"}</Text>
          </View>
          <MaterialIcons name="verified" size={22} color={colors.background} />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Pengaturan akun</Text>
        <View style={[styles.menuCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ProfileRow icon="person-outline" title="Data profil" subtitle="Nama dan alamat email akun" colors={colors} />
          <ProfileRow icon="lock-outline" title="Keamanan akun" subtitle="Sesi Anda terlindungi" colors={colors} />
          <ProfileRow icon="help-outline" title="Bantuan" subtitle="Dapatkan dukungan KONSINYASI" colors={colors} last />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keluar dari akun"
          onPress={logout}
          style={({ pressed }) => [styles.logoutButton, { borderColor: colors.border }, pressed && styles.pressed]}
        >
          <MaterialIcons name="logout" size={20} color={colors.error} />
          <Text style={[styles.logoutText, { color: colors.error }]}>Keluar dari akun</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

function ProfileRow({ icon, title, subtitle, colors, last = false }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; subtitle: string; colors: ReturnType<typeof useColors>; last?: boolean }) {
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}18` }]}>
        <MaterialIcons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{subtitle}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={21} color={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingTop: 14 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6, marginBottom: 7 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  profileCard: { flexDirection: "row", alignItems: "center", borderRadius: 24, padding: 18, marginTop: 24 },
  avatar: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 25, fontWeight: "800" },
  profileCopy: { flex: 1, marginLeft: 14 },
  name: { fontSize: 17, fontWeight: "800" },
  email: { fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginTop: 30, marginBottom: 12 },
  menuCard: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 15 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, marginLeft: 12 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowSubtitle: { fontSize: 12, marginTop: 3 },
  logoutButton: { minHeight: 52, borderWidth: 1, borderRadius: 16, flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", marginTop: 18 },
  logoutText: { fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
