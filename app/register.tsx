import { ScreenContainer } from "@/components/screen-container";
import { AppIcon } from "@/components/ui/app-icon";
import { PasswordInput } from "@/components/ui/password-input";
import { useColors } from "@/hooks/use-colors";
import { isValidPhone, isValidProfileAddress, isValidProfileName, normalizePhone, type KtpUpload } from "@/shared/user-profile";
import { trpc } from "@/lib/trpc";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

export default function RegisterScreen() {
  const colors = useColors();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactRelation, setEmergencyContactRelation] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [ktpUpload, setKtpUpload] = useState<KtpUpload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const createDistributor = trpc.registration.createDistributor.useMutation();

  async function selectKtp() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [16, 10],
        quality: 0.75,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.base64) {
        setError("Foto KTP belum dapat dibaca. Silakan pilih foto lain.");
        return;
      }
      if ((asset.fileSize ?? 0) > 5 * 1024 * 1024) {
        setError("Ukuran foto KTP maksimal 5 MB.");
        return;
      }
      setKtpUpload({
        uri: asset.uri,
        base64: asset.base64,
        contentType: "image/jpeg",
        originalName: asset.fileName ?? `ktp-${Date.now()}.jpg`,
        fileSize: asset.fileSize,
      });
      setError(null);
    } catch {
      setError("Foto KTP belum dapat dipilih. Coba lagi.");
    }
  }

  async function handleRegister() {
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidProfileName(normalizedName)) return setError("Nama lengkap minimal 2 karakter.");
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return setError("Masukkan alamat email yang valid.");
    if (!isValidPhone(phone)) return setError("Masukkan nomor HP yang valid.");
    if (!isValidProfileName(emergencyContactName)) return setError("Masukkan nama kontak darurat.");
    if (emergencyContactRelation.trim().length < 2) return setError("Masukkan hubungan kontak darurat.");
    if (!isValidPhone(emergencyContactPhone)) return setError("Masukkan nomor HP kontak darurat yang valid.");
    if (!isValidProfileAddress(address)) return setError("Masukkan alamat lengkap minimal 10 karakter.");
    if (password.length < 8) return setError("Kata sandi minimal 8 karakter.");
    if (password !== confirmPassword) return setError("Konfirmasi password tidak sama.");
    if (!ktpUpload) return setError("Foto KTP wajib diunggah.");

    setError(null);
    try {
      await createDistributor.mutateAsync({
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizePhone(phone),
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactRelation: emergencyContactRelation.trim(),
        emergencyContactPhone: normalizePhone(emergencyContactPhone),
        address: address.trim(),
        ktpBase64: ktpUpload.base64,
        ktpContentType: ktpUpload.contentType,
        ktpOriginalName: ktpUpload.originalName,
        password,
      });
      setSubmitted(true);
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "Pendaftaran belum dapat diproses.";
      setError(message.toLowerCase().includes("already") ? "Email tersebut sudah terdaftar." : message);
    }
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-6">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali ke login" onPress={() => router.back()} style={styles.backButton}>
            <AppIcon name="arrow-back" size={22} color={colors.foreground} />
            <Text style={[styles.backText, { color: colors.foreground }]}>Kembali</Text>
          </Pressable>

          {submitted ? (
            <View style={styles.successContent}>
              <View style={[styles.successIcon, { backgroundColor: `${colors.success}18` }]}>
                <AppIcon name="verified" size={32} color={colors.success} />
              </View>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>KONFIRMASI EMAIL</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Periksa kotak masuk Anda</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Tautan konfirmasi telah dikirim ke {email.trim()}. Konfirmasi email tersebut sebelum masuk ke KONSINYASI.</Text>
              <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <Text style={[styles.primaryText, { color: colors.background }]}>Kembali ke login</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>DISTRIBUTOR UTAMA</Text>
              <Text style={[styles.title, { color: colors.foreground }]}>Buat akun KONSINYASI</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Lengkapi data Distributor dan unggah KTP untuk membuat ruang kerja baru.</Text>

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Identitas</Text>
              <Field label="Nama lengkap" value={name} onChangeText={setName} placeholder="Nama lengkap" colors={colors} autoCapitalize="words" />
              <Field label="Email login" value={email} onChangeText={setEmail} placeholder="nama@email.com" colors={colors} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Kontak</Text>
              <Field label="Nomor HP" value={phone} onChangeText={setPhone} placeholder="08xxxxxxxxxx" colors={colors} keyboardType="phone-pad" />
              <Field label="Nama kontak darurat" value={emergencyContactName} onChangeText={setEmergencyContactName} placeholder="Nama kontak darurat" colors={colors} />
              <Field label="Hubungan kontak darurat" value={emergencyContactRelation} onChangeText={setEmergencyContactRelation} placeholder="Contoh: Orang tua" colors={colors} />
              <Field label="Nomor kontak darurat" value={emergencyContactPhone} onChangeText={setEmergencyContactPhone} placeholder="08xxxxxxxxxx" colors={colors} keyboardType="phone-pad" />

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Alamat dan verifikasi</Text>
              <Field label="Alamat lengkap" value={address} onChangeText={setAddress} placeholder="Jalan, nomor, RT/RW, kelurahan, kecamatan, kota" colors={colors} multiline numberOfLines={3} textAlignVertical="top" inputStyle={styles.addressInput} />
              <View style={styles.fieldWrap}>
                <Text style={[styles.label, { color: colors.foreground }]}>Foto KTP</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={ktpUpload ? "Ganti foto KTP" : "Unggah foto KTP"} onPress={() => void selectKtp()} style={({ pressed }) => [styles.uploadCard, { borderColor: ktpUpload ? colors.primary : colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
                  {ktpUpload ? (
                    <>
                      <Image source={{ uri: ktpUpload.uri }} style={styles.ktpPreview} />
                      <View style={styles.uploadCopy}>
                        <Text style={[styles.uploadTitle, { color: colors.foreground }]}>Foto KTP dipilih</Text>
                        <Text style={[styles.uploadMeta, { color: colors.muted }]} numberOfLines={1}>{ktpUpload.originalName}</Text>
                        <Text style={[styles.uploadAction, { color: colors.primary }]}>Ketuk untuk mengganti</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={[styles.uploadIcon, { backgroundColor: `${colors.primary}16` }]}><AppIcon name="upload" size={23} color={colors.primary} /></View>
                      <View style={styles.uploadCopy}>
                        <Text style={[styles.uploadTitle, { color: colors.foreground }]}>Unggah foto KTP</Text>
                        <Text style={[styles.uploadMeta, { color: colors.muted }]}>JPG, PNG, atau WEBP · maksimal 5 MB</Text>
                      </View>
                    </>
                  )}
                </Pressable>
                <Text style={[styles.helper, { color: colors.muted }]}>Wajib untuk Distributor. Foto disimpan privat dan tidak dapat diakses oleh pengguna lain.</Text>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Akses login</Text>
              <View style={styles.fieldWrap}>
                <Text style={[styles.label, { color: colors.foreground }]}>Password login</Text>
                <PasswordInput value={password} onChangeText={setPassword} placeholder="Minimal 8 karakter" placeholderTextColor={colors.muted} colors={colors} />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={[styles.label, { color: colors.foreground }]}>Konfirmasi password</Text>
                <PasswordInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Ulangi password login" placeholderTextColor={colors.muted} colors={colors} returnKeyType="done" onSubmitEditing={handleRegister} />
                <Text style={[styles.helper, { color: colors.muted }]}>Email adalah satu-satunya identitas login. Password ini digunakan seterusnya dan konfirmasi tidak disimpan.</Text>
              </View>

              {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
              <Pressable disabled={createDistributor.isPending} onPress={() => void handleRegister()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed, createDistributor.isPending && styles.disabled]}>
                {createDistributor.isPending ? <ActivityIndicator color={colors.background} /> : <Text style={[styles.primaryText, { color: colors.background }]}>Daftar Distributor</Text>}
              </Pressable>
              <Text style={[styles.note, { color: colors.muted }]}>Kami akan mengirim tautan konfirmasi ke email login Anda.</Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function Field({ label, value, onChangeText, placeholder, colors, inputStyle, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; colors: ReturnType<typeof useColors>; inputStyle?: object; [key: string]: unknown }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }, inputStyle]} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: 12, paddingBottom: 28 },
  successContent: { minHeight: 560, justifyContent: "center", alignItems: "center", paddingBottom: 48 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 28 },
  backText: { fontSize: 15, fontWeight: "700" },
  successIcon: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6, marginBottom: 8 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 10, marginBottom: 22 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 10, marginBottom: 4 },
  fieldWrap: { marginBottom: 13 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, fontSize: 15 },
  addressInput: { minHeight: 90, paddingTop: 13, paddingBottom: 13 },
  helper: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  uploadCard: { minHeight: 86, borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  uploadIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  ktpPreview: { width: 68, height: 48, borderRadius: 9, backgroundColor: "#DDE5E2" },
  uploadCopy: { flex: 1 },
  uploadTitle: { fontSize: 13, fontWeight: "800" },
  uploadMeta: { fontSize: 10, marginTop: 3 },
  uploadAction: { fontSize: 11, fontWeight: "700", marginTop: 4 },
  error: { fontSize: 13, lineHeight: 19, marginTop: 0 },
  primaryButton: { minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 18, width: "100%" },
  primaryText: { fontSize: 16, fontWeight: "800" },
  note: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 13 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.65 },
});
