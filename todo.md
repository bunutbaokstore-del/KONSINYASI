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
- [ ] Menyimpan checkpoint versi siap ditinjau

## Permintaan Fitur Akun Lanjutan

- [x] Mendokumentasikan konteks, tujuan, batasan, dan output fitur akun
- [x] Menambahkan navigasi tab Profil pengguna
- [x] Membuat halaman profil pengguna lengkap dengan identitas dan aksi akun
- [x] Membuat halaman pendaftaran akun dengan validasi form
- [x] Membuat halaman pemulihan kata sandi dengan state permintaan terkirim
- [ ] Menentukan dan menghubungkan mekanisme backend autentikasi email/password
- [ ] Menambahkan pengujian unit untuk validasi pendaftaran dan pemulihan
- [x] Menjalankan pemeriksaan TypeScript, lint, dan test fitur akun
- [ ] Menyimpan checkpoint fitur akun lanjutan

## Perbaikan Bug Font Android

- [x] Menelusuri sumber FontFaceObserver timeout 6000ms
- [x] Menghapus ketergantungan pemuatan font yang tidak diperlukan atau menambahkan fallback aman
- [x] Memvalidasi startup aplikasi Android setelah perbaikan
- [ ] Menyimpan checkpoint perbaikan bug font

## Integrasi Supabase Auth

- [ ] Memeriksa project Supabase yang terhubung
- [x] Menambahkan Supabase URL dan publishable key ke environment proyek
- [ ] Mengaktifkan dan mengonfigurasi provider email/password
- [ ] Mengatur redirect URL Android KONSINYASI
- [ ] Mengganti autentikasi Manus OAuth dengan Supabase Auth
- [ ] Menghubungkan pendaftaran, login, logout, dan pemulihan kata sandi
- [ ] Menambahkan pengujian alur Supabase Auth
- [ ] Menyimpan checkpoint integrasi Supabase

## Pengaturan Credential Supabase

- [x] Membuka ulang kartu input Supabase URL dan publishable key
- [x] Memvalidasi credential yang dimasukkan pengguna
