import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { useSupabaseAuth } from "@/lib/supabase-auth-provider";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function ResetPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const { session, updatePassword } = useSupabaseAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!session) {
      setError("Sesi pemulihan tidak tersedia. Silakan minta tautan baru.");
      return;
    }
    if (password.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (password !== confirmation) {
      setError("Konfirmasi kata sandi belum sama.");
      return;
    }

    setError(null);
    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if (result.error) {
      setError("Kata sandi belum dapat diperbarui. Silakan minta tautan baru.");
      return;
    }
    setSaved(true);
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6">
      <View style={styles.content}>
        <View style={[styles.icon, { backgroundColor: `${colors.primary}18` }]}>
          <AppIcon name="lock" size={30} color={colors.primary} />
        </View>
        {saved ? (
          <View style={styles.center}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>BERHASIL</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Kata sandi diperbarui</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Gunakan kata sandi baru Anda untuk masuk ke KONSINYASI.</Text>
            <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
              <Text style={[styles.primaryText, { color: colors.background }]}>Kembali ke login</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>KEAMANAN AKUN</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Buat kata sandi baru</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>Gunakan minimal 8 karakter dan jangan gunakan kata sandi yang sama di layanan lain.</Text>
            <Text style={[styles.label, { color: colors.foreground }]}>Kata sandi baru</Text>
            <TextInput value={password} onChangeText={setPassword} placeholder="Minimal 8 karakter" placeholderTextColor={colors.muted} secureTextEntry textContentType="newPassword" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
            <Text style={[styles.label, { color: colors.foreground }]}>Ulangi kata sandi</Text>
            <TextInput value={confirmation} onChangeText={setConfirmation} placeholder="Ketik ulang kata sandi" placeholderTextColor={colors.muted} secureTextEntry textContentType="newPassword" returnKeyType="done" onSubmitEditing={handleSubmit} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            <Pressable disabled={loading} onPress={handleSubmit} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed, loading && styles.disabled]}>
              {loading ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryText, { color: colors.background }]}>Simpan kata sandi</Text>}
            </Pressable>
          </>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingTop: 44 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  icon: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6, marginBottom: 8 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 26 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 7, marginTop: 12 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, fontSize: 15 },
  error: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  primaryButton: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20, width: "100%" },
  primaryText: { fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.65 },
});
