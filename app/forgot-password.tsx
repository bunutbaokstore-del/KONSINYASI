import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { AppIcon } from "@/components/ui/app-icon";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    setError(null);
    setSubmitted(true);
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6">
      <View style={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke login" onPress={() => router.back()} style={styles.backButton}>
          <AppIcon name="arrow-back" size={22} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Kembali</Text>
        </Pressable>
        <View style={[styles.icon, { backgroundColor: `${colors.primary}18` }]}>
          <AppIcon name="lock" size={30} color={colors.primary} />
        </View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>AKSES AKUN</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Pulihkan kata sandi</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Masukkan email akun Anda. Kami akan membantu mengarahkan proses pemulihan akses.</Text>

        {!submitted ? (
          <>
            <Text style={[styles.label, { color: colors.foreground }]}>Email akun</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="nama@email.com" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
            <Pressable onPress={handleSubmit} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
              <Text style={[styles.primaryText, { color: colors.background }]}>Kirim instruksi</Text>
            </Pressable>
          </>
        ) : (
          <View style={[styles.successCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppIcon name="verified" size={30} color={colors.success} />
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Permintaan siap diproses</Text>
            <Text style={[styles.successText, { color: colors.muted }]}>Jika email terdaftar, instruksi pemulihan akan dikirim ke {email.trim()}.</Text>
            <Pressable onPress={() => setSubmitted(false)} style={styles.tryAgain}><Text style={[styles.tryAgainText, { color: colors.primary }]}>Gunakan email lain</Text></Pressable>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingTop: 12 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 36 },
  backText: { fontSize: 15, fontWeight: "700" },
  icon: { width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6, marginBottom: 8 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 26 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, fontSize: 15 },
  error: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  primaryButton: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryText: { fontSize: 16, fontWeight: "800" },
  successCard: { borderWidth: 1, borderRadius: 20, padding: 20, alignItems: "center" },
  successTitle: { fontSize: 18, fontWeight: "800", marginTop: 13 },
  successText: { fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  tryAgain: { marginTop: 16, padding: 8 },
  tryAgainText: { fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
