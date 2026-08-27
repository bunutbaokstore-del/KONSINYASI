# Project TODO

- [x] Menetapkan target platform Android dan orientasi portrait
- [x] Menetapkan nama aplikasi KONSINYASI
- [x] Menulis rancangan interface mobile di design.md
- [x] Membuat logo aplikasi KONSINYASI
- [x] Menyalin logo ke seluruh aset launcher, splash, favicon, dan adaptive icon
- [x] Memperbarui app.config.ts dengan nama aplikasi dan logo
- [x] Menyesuaikan warna brand KONSINYASI pada theme.config.js
- [x] Mengimplementasikan layar Login dengan state loading dan error
- [x] Menghubungkan tombol login ke Manus OAuth native
- [x] Menangani sesi pengguna pada root navigation
- [x] Mengimplementasikan halaman Home setelah login
- [x] Mengimplementasikan logout dan kembali ke Login
- [ ] Menambahkan pengujian unit untuk perilaku autentikasi dan navigasi dasar
- [x] Menjalankan pemeriksaan TypeScript, lint, dan test
- [x] Menyimpan checkpoint versi siap ditinjau

## Permintaan Fitur Akun Lanjutan

- [x] Mendokumentasikan konteks, tujuan, batasan, dan output fitur akun
- [x] Menambahkan navigasi tab Profil pengguna
- [x] Membuat halaman profil pengguna lengkap dengan identitas dan aksi akun
- [x] Membuat halaman pendaftaran akun dengan validasi form
- [x] Membuat halaman pemulihan kata sandi dengan state permintaan terkirim
- [x] Menentukan dan menghubungkan mekanisme backend autentikasi email/password
- [ ] Menambahkan pengujian unit untuk validasi pendaftaran dan pemulihan
- [x] Menjalankan pemeriksaan TypeScript, lint, dan test fitur akun
- [x] Menyimpan checkpoint fitur akun lanjutan

## Perbaikan Bug Font Android

- [x] Menelusuri sumber FontFaceObserver timeout 6000ms
- [x] Menghapus ketergantungan pemuatan font yang tidak diperlukan atau menambahkan fallback aman
- [x] Memvalidasi startup aplikasi Android setelah perbaikan
- [x] Menyimpan checkpoint perbaikan bug font

## Integrasi Supabase Auth

- [x] Memeriksa project Supabase yang terhubung
- [x] Menambahkan Supabase URL dan publishable key ke environment proyek
- [x] Mengaktifkan dan mengonfigurasi provider email/password
- [x] Mengatur redirect URL Android KONSINYASI
- [x] Mengganti autentikasi Manus OAuth dengan Supabase Auth
- [x] Menghubungkan pendaftaran, login, logout, dan pemulihan kata sandi
- [ ] Menambahkan pengujian alur Supabase Auth
- [ ] Menyimpan checkpoint integrasi Supabase

## Pengaturan Credential Supabase

- [x] Membuka ulang kartu input Supabase URL dan publishable key
- [x] Memvalidasi credential yang dimasukkan pengguna

## Migrasi Login ke Supabase Auth

- [ ] Meninjau struktur autentikasi Manus OAuth yang akan diganti
- [x] Membuat client Supabase dengan session persistence
- [x] Menambahkan provider sesi Supabase pada root layout
- [x] Menghubungkan login email/password
- [x] Menghubungkan pendaftaran email/password
- [x] Menghubungkan logout ke Supabase
- [x] Menghubungkan pemulihan kata sandi dan deep link reset
- [x] Menjalankan pemeriksaan TypeScript, lint, dan test
- [ ] Menyimpan checkpoint migrasi Supabase

## Pengujian Android Supabase Auth

- [x] Membuka aplikasi KONSINYASI di perangkat Android melalui Expo Go atau build Android
- [x] Menguji pendaftaran dengan email uji baru
- [x] Mengonfirmasi email pendaftaran
- [x] Menguji login dengan credential yang benar
- [ ] Menguji penolakan credential yang salah
- [x] Menguji logout dan persistensi sesi
- [x] Mencatat error atau hasil pengujian dari perangkat
