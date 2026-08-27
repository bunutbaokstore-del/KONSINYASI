# Panduan Konfigurasi Supabase Auth untuk Android KONSINYASI

## Ringkasan

Panduan ini menjelaskan migrasi dari Manus OAuth ke autentikasi email dan kata sandi menggunakan Supabase Auth pada aplikasi Android KONSINYASI. Alur yang ditargetkan adalah pendaftaran akun, konfirmasi email, login, logout, pemulihan kata sandi, dan penggantian kata sandi melalui deep link Android.

> **Catatan penting:** KONSINYASI saat ini masih memakai Manus OAuth pada hook autentikasi dan callback yang sudah ada. Supabase Auth sebaiknya menjadi satu-satunya sumber sesi setelah migrasi selesai. Jangan menjalankan dua mekanisme autentikasi secara paralel tanpa desain sesi yang jelas.

## 1. Prasyarat

Siapkan akun Supabase, akses ke Dashboard, dan salinan kode proyek KONSINYASI. Anda juga perlu menentukan email pengirim untuk email konfirmasi dan reset password. Pada hosted Supabase, konfirmasi email biasanya aktif secara default; signup dan reset password untuk penggunaan produksi membutuhkan SMTP, sehingga konfigurasi email harus disiapkan sebelum pengujian akhir.[^1]

| Komponen | Nilai untuk KONSINYASI |
|---|---|
| Platform | Android, portrait |
| Android package | `com.app.konsinyasi` |
| URL scheme yang disarankan | `konsinyasi` |
| Redirect signup/reset | `konsinyasi://auth/callback` |
| Client key | Supabase publishable key, bukan secret/service-role key |
| Penyimpanan sesi | AsyncStorage atau storage lokal Expo yang persisten |

## 2. Membuat Project Supabase

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) dan pilih **New project**.
2. Pilih organisasi, isi nama project misalnya `konsinyasi`, buat database password, lalu pilih region yang dekat dengan mayoritas pengguna.
3. Setelah project aktif, buka **Project Settings → API** atau panel **Connect**.
4. Salin **Project URL** dan **Publishable key**. Jangan menyalin secret key atau service-role key ke aplikasi Android. Quickstart Expo resmi menggunakan `EXPO_PUBLIC_SUPABASE_URL` dan `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` untuk client.[^1]

## 3. Mengaktifkan Email dan Kata Sandi

Buka **Authentication → Providers → Email**. Pastikan provider email aktif. Pilih apakah pengguna wajib mengonfirmasi email sebelum dapat membuat sesi. Untuk aplikasi produksi, pertahankan konfirmasi email aktif agar akun tidak dibuat menggunakan alamat milik orang lain. Supabase mendukung signup dan login berbasis email/password melalui `signUp()` dan `signInWithPassword()`.[^2]

Pada **Authentication → URL Configuration**, isi **Site URL** dengan alamat web fallback jika Anda memilikinya. Pada bagian **Redirect URLs**, tambahkan sekurang-kurangnya:

```text
konsinyasi://auth/callback
```

Jika Anda memiliki scheme development yang berbeda, tambahkan juga scheme tersebut. Redirect URL harus terdaftar di Supabase sebelum dipakai oleh email confirmation atau password reset.[^3]

## 4. Menyiapkan SMTP untuk Email Produksi

Buka **Project Settings → Auth → SMTP Settings** atau menu SMTP yang tersedia pada Dashboard versi Anda. Gunakan provider email transaksional dan alamat pengirim pada domain yang Anda kendalikan. Uji pengiriman email konfirmasi dan reset password sebelum aplikasi didistribusikan.

Tanpa SMTP production, Anda mungkin dapat menguji secara lokal, tetapi email konfirmasi dan reset password tidak siap untuk pengguna nyata. Supabase sendiri merekomendasikan custom SMTP untuk produksi.[^2]

## 5. Memasang Dependency pada Expo

Dari root proyek KONSINYASI, jalankan:

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill expo-linking
```

KONSINYASI sudah memiliki sebagian dependency seperti AsyncStorage dan `expo-linking`; perintah di atas memastikan versi yang kompatibel dengan Expo. Quickstart resmi Supabase juga mendokumentasikan penggunaan `@supabase/supabase-js`, URL polyfill, dan storage persisten pada Expo React Native.[^1]

## 6. Menambahkan Environment Variables

Buat atau perbarui `.env` di root proyek. Gunakan nama berikut:

```text
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
```

Prefix `EXPO_PUBLIC_` diperlukan agar nilai dapat dibaca oleh kode Expo client. Publishable key memang dapat berada di aplikasi client; keamanan data tetap bergantung pada Auth dan Row Level Security. Jangan memasukkan `service_role` atau secret key ke `.env` yang dibundel ke Android.[^1]

Untuk proyek yang akan dipublikasikan, simpan variable yang sama pada konfigurasi environment platform build. Jangan commit file `.env` ke Git.

## 7. Mengubah Scheme Android

Di `app.config.ts`, gunakan scheme yang stabil dan unik:

```ts
const config: ExpoConfig = {
  name: "KONSINYASI",
  slug: "konsinyasi",
  scheme: "konsinyasi",
  orientation: "portrait",
  // ...
};
```

KONSINYASI saat ini menghasilkan scheme dari bundle ID Manus. Jika Anda menggantinya menjadi `konsinyasi`, redirect URL yang dipakai di Supabase harus sama persis, yaitu `konsinyasi://auth/callback`. Expo mendukung custom URL scheme melalui field `scheme`; Supabase meminta scheme tersebut didaftarkan juga pada **Additional Redirect URLs**.[^3]

Perubahan scheme memerlukan rebuild development build atau APK. Hot reload tidak cukup untuk mengubah intent filter Android.

## 8. Membuat Client Supabase

Buat `lib/supabase.ts`:

```ts
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Supabase environment variables are missing");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

`detectSessionInUrl` dibuat `false` karena aplikasi native menangani deep link secara eksplisit. Supabase juga menyediakan pola storage lokal persisten pada quickstart Expo.[^1]

## 9. Membuat Context Sesi Pengguna

Buat provider, misalnya `lib/supabase-auth-provider.tsx`, yang melakukan tiga hal: mengambil sesi awal dengan `supabase.auth.getSession()`, berlangganan `supabase.auth.onAuthStateChange()`, dan menyediakan `session`, `user`, `loading`, serta `signOut` ke seluruh layar.

Contoh inti provider:

```tsx
import { Session, User } from "@supabase/supabase-js";
import { createContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      listener.subscription.unsubscribe();
      subscription.remove();
    };
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loading,
    signOut: () => supabase.auth.signOut(),
  }), [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

Daftarkan provider di `app/_layout.tsx`, lalu ubah `use-auth.ts` agar membaca provider Supabase. Callback Manus OAuth dan pemanggilan `Api.getMe()` tidak lagi menjadi sumber sesi utama.

## 10. Implementasi Pendaftaran

Pada tombol daftar, validasi nama, email, dan kata sandi di aplikasi, lalu panggil:

```ts
const redirectTo = "konsinyasi://auth/callback";

const { data, error } = await supabase.auth.signUp({
  email: email.trim().toLowerCase(),
  password,
  options: {
    data: { full_name: name.trim() },
    emailRedirectTo: redirectTo,
  },
});

if (error) throw error;

if (!data.session) {
  // Konfirmasi email aktif; tampilkan instruksi cek inbox.
}
```

Jangan menganggap akun sudah aktif hanya karena `signUp()` berhasil. Jika konfirmasi email aktif, session dapat tetap `null` sampai pengguna menekan tautan konfirmasi. Tampilkan pesan yang tidak membocorkan detail sensitif.

## 11. Implementasi Login

Pada layar Login, ganti pemanggilan Manus OAuth dengan:

```ts
const { data, error } = await supabase.auth.signInWithPassword({
  email: email.trim().toLowerCase(),
  password,
});

if (error) {
  setError("Email atau kata sandi tidak benar, atau email belum dikonfirmasi.");
  return;
}

// data.session tersedia setelah login berhasil.
```

Simpan sesi melalui konfigurasi client Supabase, bukan dengan menyimpan kata sandi secara manual. Setelah state sesi berubah, route guard dapat menampilkan Home atau mengembalikan pengguna ke Login.

## 12. Implementasi Pemulihan Kata Sandi

Layar Forgot Password hanya meminta email dan memanggil:

```ts
const { error } = await supabase.auth.resetPasswordForEmail(
  email.trim().toLowerCase(),
  { redirectTo: "konsinyasi://auth/callback?mode=reset" },
);

if (error) {
  setError("Permintaan belum dapat diproses. Silakan coba lagi.");
  return;
}

setSubmitted(true);
```

Untuk mencegah user enumeration, tampilkan pesan umum yang tidak menyatakan apakah email tertentu terdaftar. Supabase mendesain `resetPasswordForEmail()` agar tidak mengungkapkan keberadaan akun.[^2]

Setelah pengguna menekan tautan email, aplikasi harus menerima deep link, membuat session dari token yang diterima, lalu menampilkan halaman **Ubah Kata Sandi**. Halaman tersebut memanggil:

```ts
const { error } = await supabase.auth.updateUser({
  password: newPassword,
});
```

Halaman ubah kata sandi hanya boleh muncul ketika session reset sudah berhasil dibuat. Supabase mensyaratkan halaman reset publik, redirect URL terdaftar, dan halaman ubah password yang hanya dapat diakses oleh pengguna authenticated.[^2]

## 13. Menangani Deep Link Android

Supabase mendokumentasikan bahwa signup confirmation dan password reset pada mobile memerlukan custom URL scheme dan handler deep link.[^3] Pada Expo, gunakan `expo-linking` untuk membaca URL yang membuka aplikasi. Handler harus:

1. Membaca URL awal saat aplikasi dibuka dari keadaan tertutup.
2. Mendengarkan URL baru saat aplikasi sudah berjalan.
3. Mengekstrak `access_token` dan `refresh_token` jika implicit flow digunakan, lalu memanggil `supabase.auth.setSession()`.
4. Mengarahkan ke Home untuk konfirmasi/signup atau halaman ubah password untuk reset.
5. Menghapus token dari state navigasi setelah diproses.

Pola yang disarankan Supabase menggunakan `Linking` dan parser query dari Expo Auth Session, kemudian memanggil `supabase.auth.setSession({ access_token, refresh_token })`.[^3] Pastikan dependency parser yang dipilih kompatibel dengan Expo SDK proyek Anda.

## 14. Profil Pengguna dan Tabel Public Profile

Data autentikasi berada di `auth.users` dan tidak boleh diakses langsung secara sembarangan dari client. Untuk data profil aplikasi, buat tabel public seperti berikut di Supabase SQL Editor:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
```

Buat row profile melalui trigger atau server-side flow yang terkontrol. Jika menggunakan trigger, uji rollback dan error handling. Semua tabel data konsinyasi yang terkait pengguna harus memiliki `user_id` dan policy RLS yang membatasi akses menggunakan `auth.uid()`.

## 15. Menghapus Manus OAuth dari KONSINYASI

Setelah Supabase Auth sudah teruji, lakukan migrasi berikut:

| Area | Perubahan |
|---|---|
| Login | Ganti tombol Manus OAuth dengan email/password |
| Register | Panggil `supabase.auth.signUp()` |
| Forgot Password | Panggil `resetPasswordForEmail()` |
| Reset page | Tambahkan route ubah kata sandi dan `updateUser()` |
| Session hook | Ganti `use-auth.ts` agar membaca Supabase session |
| Root layout | Daftarkan `SupabaseAuthProvider` |
| OAuth callback | Jangan gunakan callback Manus untuk flow Supabase |
| Logout | Gunakan `supabase.auth.signOut()` |
| Storage | Jangan simpan password; sesi dikelola storage client Supabase |

## 16. Checklist Pengujian Android

Uji setiap skenario pada development build atau APK, bukan hanya preview web:

- Pendaftaran dengan email valid dan kata sandi minimal sesuai policy.
- Pendaftaran dengan email yang sudah terdaftar.
- Email konfirmasi membuka `konsinyasi://auth/callback`.
- Login sebelum dan sesudah konfirmasi email.
- Login dengan password salah tanpa membocorkan detail akun.
- Logout lalu membuka ulang aplikasi.
- Session tetap tersedia setelah aplikasi ditutup dan dibuka kembali.
- Reset password dengan email terdaftar dan tidak terdaftar; keduanya memakai pesan umum.
- Tautan reset membuka aplikasi dan halaman ubah password.
- Password baru dapat dipakai untuk login.
- Deep link saat aplikasi cold-start dan saat aplikasi sudah terbuka.
- Tidak ada secret key, password, atau token yang ditulis ke log.

## Batasan dan Risiko

Konfigurasi ini mengubah arsitektur autentikasi, bukan hanya mengganti satu tombol. Anda memerlukan Supabase project, environment variables, redirect scheme, SMTP produksi, migration data profile, dan pengujian deep link Android. Jika tetap memakai Manus OAuth, langkah-langkah Supabase tidak akan memengaruhi sesi Manus yang sekarang. Jika memakai Supabase, implementasikan migrasi menyeluruh dan jangan menyimpan dua token sebagai sumber kebenaran yang berbeda.

## References

[^1]: [Supabase — Use Supabase with Expo React Native](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)
[^2]: [Supabase — Password-based Auth](https://supabase.com/docs/guides/auth/passwords)
[^3]: [Supabase — Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
