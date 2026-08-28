import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { PasswordInput } from "@/components/ui/password-input";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useSupabaseAuth } from "@/lib/supabase-auth-provider";
import { trpc } from "@/lib/trpc";
import { ROLE_LABELS } from "@/shared/auth";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const { signIn } = useSupabaseAuth();
  const notificationsQuery = trpc.notifications.list.useQuery(undefined, { enabled: isAuthenticated });
  const unreadNotificationCount = (notificationsQuery.data ?? []).filter((notification) => !notification.isRead).length;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setLoginError("Masukkan alamat email yang valid.");
      return;
    }
    if (!password) {
      setLoginError("Masukkan kata sandi Anda.");
      return;
    }

    setLoginLoading(true);
    setLoginError(null);
    const { error } = await signIn(normalizedEmail, password);
    setLoginLoading(false);
    if (error) {
      setLoginError("Email atau kata sandi tidak benar, atau email belum dikonfirmasi.");
    }
  };

  if (loading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>Memeriksa sesi Anda…</Text>
      </ScreenContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6">
        <View style={styles.loginContent}>
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <AppIcon name="inventory" size={42} color={colors.background} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>RUANG TITIPAN TERPERCAYA</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Selamat datang di KONSINYASI</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Masuk untuk mengelola perjalanan konsinyasi Anda dengan lebih rapi.</Text>

          <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppIcon name="verified-user" size={22} color={colors.primary} />
            <View style={styles.infoCopy}>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>Akses aman dan praktis</Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>Gunakan email dan kata sandi akun Anda untuk masuk ke ruang kerja KONSINYASI.</Text>
            </View>
          </View>

          <View style={styles.form}>
            <Text style={[styles.inputLabel, { color: colors.foreground }]}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="nama@email.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Text style={[styles.inputLabel, { color: colors.foreground }]}>Kata sandi</Text>
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="Masukkan kata sandi"
              placeholderTextColor={colors.muted}
              colors={colors}
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </View>

          {loginError ? <Text style={[styles.errorText, { color: colors.error }]}>{loginError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Masuk dengan email dan kata sandi"
            disabled={loginLoading}
            onPress={handleLogin}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary },
              pressed && styles.pressed,
              loginLoading && styles.disabled,
            ]}
          >
            {loginLoading ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryButtonText, { color: colors.background }]}>Masuk</Text>}
          </Pressable>
          <View style={styles.linkRow}>
            <Pressable onPress={() => router.push("/register")} accessibilityRole="button">
              <Text style={[styles.linkText, { color: colors.primary }]}>Buat akun baru</Text>
            </Pressable>
            <Text style={[styles.linkDivider, { color: colors.border }]}>|</Text>
            <Pressable onPress={() => router.push("/forgot-password")} accessibilityRole="button">
              <Text style={[styles.linkText, { color: colors.primary }]}>Lupa kata sandi?</Text>
            </Pressable>
          </View>
          <Text style={[styles.legalText, { color: colors.muted }]}>Dengan masuk, Anda menyetujui proses autentikasi aman KONSINYASI.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const displayName = user?.name?.trim() || "Pengguna KONSINYASI";
  const role = user?.role ?? "distributor";
  const canManageUsers = role === "distributor" || role === "admin";
  return (
    <ScreenContainer className="px-6">
      <View style={styles.homeContent}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>KONSINYASI</Text>
            <Text style={[styles.greeting, { color: colors.foreground }]}>Halo, {displayName}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={unreadNotificationCount > 0 ? `Buka notifikasi, ${unreadNotificationCount} belum dibaca` : "Buka notifikasi"} onPress={() => router.push("/notifications")} style={({ pressed }) => [styles.notificationButton, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
            <AppIcon name="notifications" size={22} color={colors.primary} />
            {unreadNotificationCount > 0 ? <View style={[styles.notificationBadge, { backgroundColor: colors.error }]}><Text style={[styles.notificationBadgeText, { color: colors.background }]}>{unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}</Text></View> : null}
          </Pressable>
        </View>

        <View style={[styles.welcomeCard, { backgroundColor: colors.primary }]}>
          <View style={styles.cardIcon}><AppIcon name="handshake" size={28} color={colors.primary} /></View>
          <Text style={[styles.cardTitle, { color: colors.background }]}>Akun Anda siap digunakan</Text>
          <Text style={[styles.cardText, { color: "#D9EFE5" }]}>Selamat datang di ruang kerja KONSINYASI. Fitur konsinyasi Anda akan hadir di sini.</Text>
        </View>

        <View style={[styles.accountCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>AKUN AKTIF</Text>
          <Text style={[styles.accountName, { color: colors.foreground }]}>{displayName}</Text>
          {user?.email ? <Text style={[styles.accountEmail, { color: colors.muted }]}>{user.email}</Text> : null}
          <View style={[styles.roleBadge, { backgroundColor: `${colors.primary}16` }]}>
            <Text style={[styles.roleBadgeText, { color: colors.primary }]}>{ROLE_LABELS[role]}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Buka notifikasi" onPress={() => router.push("/notifications")} style={({ pressed }) => [styles.managementButton, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
          <AppIcon name="verified" size={20} color={colors.primary} />
          <View style={styles.managementCopy}><Text style={[styles.managementTitle, { color: colors.foreground }]}>Notifikasi</Text><Text style={[styles.managementText, { color: colors.muted }]}>Lihat status pengajuan yang diproses Admin</Text></View>
          <AppIcon name="chevron-right" size={20} color={colors.primary} />
        </Pressable>
        {(role === "mitra_umkm" || canManageUsers) ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Buka riwayat mutasi stok" onPress={() => router.push("/stock-history")} style={({ pressed }) => [styles.managementButton, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
            <AppIcon name="inventory" size={20} color={colors.primary} />
            <View style={styles.managementCopy}><Text style={[styles.managementTitle, { color: colors.foreground }]}>Riwayat mutasi stok</Text><Text style={[styles.managementText, { color: colors.muted }]}>Lihat catatan perubahan stok yang disetujui</Text></View>
            <AppIcon name="chevron-right" size={20} color={colors.primary} />
          </Pressable>
        ) : null}
        {role === "mitra_umkm" ? <MitraStockDashboard /> : null}
        {role === "mitra_umkm" ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Ajukan barang atau perubahan stok" onPress={() => router.push("/supplier-requests")} style={({ pressed }) => [styles.managementButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }, pressed && styles.pressed]}>
            <AppIcon name="inventory" size={20} color={colors.primary} />
            <View style={styles.managementCopy}>
              <Text style={[styles.managementTitle, { color: colors.foreground }]}>Ajukan ke Admin</Text>
              <Text style={[styles.managementText, { color: colors.muted }]}>Kirim barang atau perubahan stok untuk disetujui</Text>
            </View>
            <AppIcon name="chevron-right" size={20} color={colors.primary} />
          </Pressable>
        ) : null}
        {canManageUsers ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Buka Manajemen Pengguna" onPress={() => router.push("/manage-users")} style={({ pressed }) => [styles.managementButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }, pressed && styles.pressed]}>
              <AppIcon name="group" size={20} color={colors.primary} />
              <View style={styles.managementCopy}>
                <Text style={[styles.managementTitle, { color: colors.foreground }]}>Manajemen Pengguna</Text>
                <Text style={[styles.managementText, { color: colors.muted }]}>Buat dan kelola akun sesuai kewenangan</Text>
              </View>
              <AppIcon name="chevron-right" size={20} color={colors.primary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Buka Kelola Barang Titipan" onPress={() => router.push("/manage-inventory")} style={({ pressed }) => [styles.managementButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }, pressed && styles.pressed]}>
              <AppIcon name="inventory" size={20} color={colors.primary} />
              <View style={styles.managementCopy}>
                <Text style={[styles.managementTitle, { color: colors.foreground }]}>Kelola Barang Titipan</Text>
                <Text style={[styles.managementText, { color: colors.muted }]}>Atur barang dan stok Mitra UMKM</Text>
              </View>
              <AppIcon name="chevron-right" size={20} color={colors.primary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Buka Persetujuan Supplier" onPress={() => router.push("/supplier-requests")} style={({ pressed }) => [styles.managementButton, { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }, pressed && styles.pressed]}>
              <AppIcon name="verified" size={20} color={colors.primary} />
              <View style={styles.managementCopy}>
                <Text style={[styles.managementTitle, { color: colors.foreground }]}>Persetujuan Supplier</Text>
                <Text style={[styles.managementText, { color: colors.muted }]}>Periksa pengajuan Mitra UMKM</Text>
              </View>
              <AppIcon name="chevron-right" size={20} color={colors.primary} />
            </Pressable>
          </>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function MitraStockDashboard() {
  const colors = useColors();
  const stockQuery = trpc.mitraDashboard.stock.useQuery();
  const items = stockQuery.data?.items ?? [];
  const summary = stockQuery.data?.summary ?? {
    itemCount: 0,
    totalUnits: 0,
    safeCount: 0,
    lowCount: 0,
    outOfStockCount: 0,
  };

  if (stockQuery.isLoading) {
    return <View style={styles.stockLoading}><ActivityIndicator color={colors.primary} /><Text style={[styles.stockLoadingText, { color: colors.muted }]}>Memuat stok barang titipan…</Text></View>;
  }

  if (stockQuery.error) {
    return <View style={[styles.stockErrorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.stockSectionTitle, { color: colors.foreground }]}>Barang titipan</Text><Text style={[styles.stockErrorText, { color: colors.error }]}>{stockQuery.error.message}</Text><Pressable accessibilityRole="button" onPress={() => void stockQuery.refetch()} style={({ pressed }) => [styles.stockRetryButton, { borderColor: colors.primary }, pressed && styles.pressed]}><Text style={[styles.stockRetryText, { color: colors.primary }]}>Coba lagi</Text></Pressable></View>;
  }

  return (
    <View style={styles.stockDashboard}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        style={styles.stockList}
        contentContainerStyle={styles.stockListContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={stockQuery.isRefetching} onRefresh={() => void stockQuery.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        ListHeaderComponent={
          <View>
            <View style={styles.stockSectionHeader}>
              <View style={styles.stockSectionCopy}><Text style={[styles.stockSectionTitle, { color: colors.foreground }]}>Barang titipan</Text><Text style={[styles.stockSectionSubtitle, { color: colors.muted }]}>Pantau persediaan yang menjadi tanggung jawab Anda</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Muat ulang stok barang" onPress={() => void stockQuery.refetch()} style={({ pressed }) => [styles.stockRefreshButton, { borderColor: colors.border }, pressed && styles.pressed]}><AppIcon name="refresh" size={18} color={colors.primary} /></Pressable>
            </View>
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.summaryValue, { color: colors.foreground }]}>{summary.itemCount}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>Jenis barang</Text></View>
              <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.summaryValue, { color: colors.foreground }]}>{summary.totalUnits}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>Total unit</Text></View>
              <View style={[styles.summaryCard, { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}45` }]}><Text style={[styles.summaryValue, { color: colors.warning }]}>{summary.lowCount + summary.outOfStockCount}</Text><Text style={[styles.summaryLabel, { color: colors.muted }]}>Perlu cek</Text></View>
            </View>
            <View style={styles.statusLegend}><View style={styles.statusLegendItem}><View style={[styles.statusDot, { backgroundColor: colors.success }]} /><Text style={[styles.statusLegendText, { color: colors.muted }]}>Aman {summary.safeCount}</Text></View><View style={styles.statusLegendItem}><View style={[styles.statusDot, { backgroundColor: colors.warning }]} /><Text style={[styles.statusLegendText, { color: colors.muted }]}>Menipis {summary.lowCount}</Text></View><View style={styles.statusLegendItem}><View style={[styles.statusDot, { backgroundColor: colors.error }]} /><Text style={[styles.statusLegendText, { color: colors.muted }]}>Habis {summary.outOfStockCount}</Text></View></View>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = item.status === "aman" ? colors.success : item.status === "menipis" ? colors.warning : colors.error;
          const statusLabel = item.status === "aman" ? "Aman" : item.status === "menipis" ? "Menipis" : "Habis";
          return <View style={[styles.stockItemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.stockItemIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="inventory" size={21} color={colors.primary} /></View><View style={styles.stockItemCopy}><Text style={[styles.stockItemName, { color: colors.foreground }]}>{item.name}</Text>{item.sku ? <Text style={[styles.stockItemSku, { color: colors.muted }]}>Kode: {item.sku}</Text> : null}<Text style={[styles.stockItemUpdated, { color: colors.muted }]}>Diperbarui {new Date(item.updatedAt).toLocaleDateString("id-ID")}</Text></View><View style={styles.stockItemRight}><Text style={[styles.stockQuantity, { color: colors.foreground }]}>{item.stockQuantity}</Text><Text style={[styles.stockUnit, { color: colors.muted }]}>{item.unit}</Text><Text style={[styles.stockStatus, { color: statusColor, backgroundColor: `${statusColor}16` }]}>{statusLabel}</Text></View></View>;
        }}
        ListEmptyComponent={<View style={[styles.stockEmptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><AppIcon name="inventory" size={29} color={colors.muted} /><Text style={[styles.stockEmptyTitle, { color: colors.foreground }]}>Belum ada barang titipan</Text><Text style={[styles.stockEmptyText, { color: colors.muted }]}>Daftar barang dan status stok akan tampil setelah data titipan ditambahkan ke ruang kerja Anda.</Text></View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loginContent: { flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: 24 },
  logo: { width: 88, height: 88, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.7, textAlign: "center", marginBottom: 10 },
  title: { fontSize: 32, lineHeight: 39, fontWeight: "800", textAlign: "center", letterSpacing: -0.7 },
  subtitle: { fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 12, maxWidth: 340 },
  infoCard: { flexDirection: "row", width: "100%", borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 22, alignItems: "flex-start" },
  infoCopy: { flex: 1, marginLeft: 12 },
  infoTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  infoText: { fontSize: 13, lineHeight: 19 },
  form: { width: "100%", marginTop: 18 },
  inputLabel: { fontSize: 13, fontWeight: "700", marginBottom: 7, marginTop: 10 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, fontSize: 15 },
  primaryButton: { width: "100%", minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryButtonText: { fontSize: 16, fontWeight: "800" },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 },
  linkText: { fontSize: 13, fontWeight: "800" },
  linkDivider: { fontSize: 13 },
  legalText: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 14, maxWidth: 310 },
  errorText: { width: "100%", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 12 },
  loadingText: { marginTop: 14, fontSize: 14 },
  homeContent: { flex: 1, paddingTop: 14 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, notificationButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", position: "relative" }, notificationBadge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" }, notificationBadgeText: { fontSize: 9, lineHeight: 12, fontWeight: "900" },
  greeting: { fontSize: 27, lineHeight: 34, fontWeight: "800", letterSpacing: -0.4 },
  welcomeCard: { borderRadius: 24, padding: 22, marginTop: 28 },
  cardIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#F7F8F4", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  cardTitle: { fontSize: 22, lineHeight: 28, fontWeight: "800" },
  cardText: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  accountCard: { borderWidth: 1, borderRadius: 20, padding: 20, marginTop: 16 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3, marginBottom: 8 },
  accountName: { fontSize: 18, fontWeight: "700" },
  accountEmail: { fontSize: 14, marginTop: 5 },
  roleBadge: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginTop: 12 },
  roleBadgeText: { fontSize: 11, fontWeight: "800" },
  managementButton: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 14 },
  managementCopy: { flex: 1, marginLeft: 11 },
  managementTitle: { fontSize: 14, fontWeight: "800" },
  managementText: { fontSize: 12, marginTop: 3 },
  stockDashboard: { flex: 1, marginTop: 18 },
  stockList: { flex: 1 },
  stockListContent: { paddingBottom: 24, gap: 10 },
  stockSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  stockSectionCopy: { flex: 1, paddingRight: 12 },
  stockSectionTitle: { fontSize: 18, fontWeight: "800" },
  stockSectionSubtitle: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  stockRefreshButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  summaryGrid: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, minHeight: 72, borderWidth: 1, borderRadius: 15, padding: 11 },
  summaryValue: { fontSize: 20, fontWeight: "800" },
  summaryLabel: { fontSize: 10, marginTop: 3 },
  statusLegend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 11, marginBottom: 2 },
  statusLegendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLegendText: { fontSize: 10, fontWeight: "700" },
  stockItemCard: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 17, padding: 12 },
  stockItemIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  stockItemCopy: { flex: 1, marginLeft: 10, paddingRight: 8 },
  stockItemName: { fontSize: 14, fontWeight: "800" },
  stockItemSku: { fontSize: 10, marginTop: 3 },
  stockItemUpdated: { fontSize: 9, marginTop: 4 },
  stockItemRight: { alignItems: "flex-end", minWidth: 62 },
  stockQuantity: { fontSize: 18, fontWeight: "800" },
  stockUnit: { fontSize: 10, marginTop: -2 },
  stockStatus: { fontSize: 10, fontWeight: "800", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, marginTop: 6 },
  stockEmptyCard: { borderWidth: 1, borderRadius: 17, padding: 22, alignItems: "center", marginTop: 2 },
  stockEmptyTitle: { fontSize: 14, fontWeight: "800", marginTop: 10 },
  stockEmptyText: { fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 5 },
  stockLoading: { alignItems: "center", paddingVertical: 22 },
  stockLoadingText: { fontSize: 12, marginTop: 8 },
  stockErrorCard: { borderWidth: 1, borderRadius: 17, padding: 16, marginTop: 18 },
  stockErrorText: { fontSize: 12, lineHeight: 18, marginTop: 7 },
  stockRetryButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12 },
  stockRetryText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.65 },
});
