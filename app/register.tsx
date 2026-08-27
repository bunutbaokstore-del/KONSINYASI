import { startOAuthLogin } from "@/constants/oauth";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function RegisterScreen() {
  const colors = useColors();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim()) return setError("Nama lengkap wajib diisi.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Masukkan alamat email yang valid.");
    if (password.length < 8) return setError("Kata sandi minimal 8 karakter.");
    setError(null);
    setLoading(true);
    try {
      // Akun dikelola oleh portal autentikasi resmi; data form hanya divalidasi di sisi aplikasi.
      await startOAuthLogin();
    } catch {
      setLoading(false);
      setError("Pendaftaran belum dapat dimulai. Silakan coba lagi.");
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6">
      <View style={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke login" onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={22} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Kembali</Text>
        </Pressable>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>AKUN BARU</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Buat akun KONSINYASI</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Lengkapi data Anda untuk mulai menggunakan KONSINYASI.</Text>

        <Field label="Nama lengkap" value={name} onChangeText={setName} placeholder="Nama Anda" colors={colors} autoCapitalize="words" />
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="nama@email.com" colors={colors} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Kata sandi" value={password} onChangeText={setPassword} placeholder="Minimal 8 karakter" colors={colors} secureTextEntry />
        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        <Pressable disabled={loading} onPress={handleRegister} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed, loading && styles.disabled]}>
          {loading ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryText, { color: colors.background }]}>Daftar dan lanjutkan</Text>}
        </Pressable>
        <Text style={[styles.note, { color: colors.muted }]}>Autentikasi akun dilanjutkan melalui layanan resmi KONSINYASI.</Text>
      </View>
    </ScreenContainer>
  );
}

function Field({ label, value, onChangeText, placeholder, colors, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; colors: ReturnType<typeof useColors>; [key: string]: unknown }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingTop: 12 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 36 },
  backText: { fontSize: 15, fontWeight: "700" },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6, marginBottom: 8 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 24 },
  fieldWrap: { marginBottom: 15 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, fontSize: 15 },
  error: { fontSize: 13, lineHeight: 19, marginTop: 0 },
  primaryButton: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryText: { fontSize: 16, fontWeight: "800" },
  note: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 13 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.65 },
});
