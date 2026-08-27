import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { useSupabaseAuth } from "@/lib/supabase-auth-provider";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function ChangePasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const { updatePassword, completePasswordSetup, signOut } = useSupabaseAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (password.length < 8) {
      setError("Password baru minimal 8 karakter.");
      return;
    }
    if (password !== confirmation) {
      setError("Konfirmasi password belum sama.");
      return;
    }

    setLoading(true);
    setError(null);
    const passwordResult = await updatePassword(password);
    if (passwordResult.error) {
      setLoading(false);
      setError("Password belum dapat diubah. Silakan coba lagi.");
      return;
    }

    const metadataResult = await completePasswordSetup();
    setLoading(false);
    if (metadataResult.error) {
      setError("Password berubah, tetapi status akun belum tersimpan. Silakan coba lagi.");
      return;
    }
    router.replace("/");
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6">
      <View style={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={({ pressed }) => [styles.back, { borderColor: colors.border }, pressed && styles.pressed]}>
          <AppIcon name="arrow-back" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Keluar</Text>
        </Pressable>
        <View style={[styles.iconBox, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="lock" size={28} color={colors.primary} /></View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>KEAMANAN AKUN</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Buat password pribadi</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Password awal dari pengelola hanya berlaku untuk masuk pertama. Buat password pribadi sebelum melanjutkan.</Text>

        <Text style={[styles.label, { color: colors.foreground }]}>Password baru</Text>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Minimal 8 karakter" placeholderTextColor={colors.muted} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} />
        <Text style={[styles.label, { color: colors.foreground }]}>Konfirmasi password</Text>
        <TextInput value={confirmation} onChangeText={setConfirmation} secureTextEntry placeholder="Ulangi password baru" placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={() => void handleSubmit()} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]} />
        {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void handleSubmit()} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && styles.pressed, loading && styles.disabled]}>
          {loading ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.buttonText, { color: colors.background }]}>Simpan dan lanjutkan</Text>}
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingTop: 14 },
  back: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 7, paddingVertical: 8, paddingRight: 12 },
  backText: { fontSize: 14, fontWeight: "700" },
  iconBox: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginTop: 34 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginTop: 25 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6, marginTop: 7 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 11, maxWidth: 360 },
  label: { fontSize: 12, fontWeight: "800", marginTop: 22, marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, fontSize: 15 },
  error: { fontSize: 13, lineHeight: 19, marginTop: 12 },
  button: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20 },
  buttonText: { fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.65 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
