import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useSupabaseAuth } from "@/lib/supabase-auth-provider";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const { signIn } = useSupabaseAuth();
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
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Masukkan kata sandi"
              placeholderTextColor={colors.muted}
              secureTextEntry
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
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
  return (
    <ScreenContainer className="px-6">
      <View style={styles.homeContent}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>KONSINYASI</Text>
            <Text style={[styles.greeting, { color: colors.foreground }]}>Halo, {displayName}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keluar dari akun"
            onPress={logout}
            style={({ pressed }) => [styles.iconButton, { borderColor: colors.border }, pressed && styles.pressed]}
          >
            <AppIcon name="logout" size={21} color={colors.primary} />
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
        </View>
      </View>
    </ScreenContainer>
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontSize: 27, lineHeight: 34, fontWeight: "800", letterSpacing: -0.4 },
  iconButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  welcomeCard: { borderRadius: 24, padding: 22, marginTop: 28 },
  cardIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#F7F8F4", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  cardTitle: { fontSize: 22, lineHeight: 28, fontWeight: "800" },
  cardText: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  accountCard: { borderWidth: 1, borderRadius: 20, padding: 20, marginTop: 16 },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3, marginBottom: 8 },
  accountName: { fontSize: 18, fontWeight: "700" },
  accountEmail: { fontSize: 14, marginTop: 5 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.65 },
});
