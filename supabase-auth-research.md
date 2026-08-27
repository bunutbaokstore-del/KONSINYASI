# Temuan Dokumentasi Supabase Auth

Sumber resmi yang ditinjau:

1. https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native
2. https://supabase.com/docs/guides/auth/quickstarts/react-native
3. https://supabase.com/docs/guides/auth/passwords
4. https://supabase.com/docs/guides/auth/native-mobile-deep-linking

Temuan utama:

- Expo menggunakan environment variable dengan prefix `EXPO_PUBLIC_` untuk nilai yang perlu diakses client, termasuk `EXPO_PUBLIC_SUPABASE_URL` dan `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Supabase merekomendasikan `@supabase/supabase-js` dan penyimpanan sesi persisten untuk React Native; quickstart Expo terbaru menunjukkan `expo-sqlite/localStorage/install`, sedangkan quickstart React Native juga mendokumentasikan AsyncStorage.
- Email authentication aktif secara default. Pada hosted project, konfirmasi email secara default diperlukan sebelum sesi dibuat.
- Signup dan reset password membutuhkan SMTP untuk pengiriman email produksi. Custom SMTP direkomendasikan untuk produksi.
- `resetPasswordForEmail()` tidak mengungkapkan apakah email terdaftar, untuk mencegah user enumeration.
- Reset password memerlukan halaman reset yang publik, redirect URL yang terdaftar, halaman ubah password yang hanya dapat diakses setelah authenticated, dan `updateUser({ password })`.
- Aplikasi mobile memerlukan custom URL scheme pada app config dan redirect URL tambahan di Supabase Auth URL Configuration. Deep link diperlukan untuk signup confirmation dan password reset.
- Sumber resmi: Supabase Docs, halaman “Use Supabase with Expo React Native”, “Use Supabase Auth with React Native”, “Password-based Auth”, dan “Native Mobile Deep Linking”.
