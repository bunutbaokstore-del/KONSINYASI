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

## Perbaikan Reset Password Supabase

- [ ] Menelusuri alasan `resetPasswordForEmail` gagal
- [ ] Memperjelas pesan error pemulihan kata sandi di aplikasi
- [ ] Memastikan redirect reset password diizinkan Supabase
- [ ] Memvalidasi pengiriman instruksi pemulihan
- [ ] Menyimpan checkpoint perbaikan reset password

## Penanganan Email Rate Limit

- [x] Mencatat error `email rate limit exceeded` pada pemulihan kata sandi
- [x] Menampilkan pesan rate limit yang informatif dan aman di aplikasi
- [ ] Menyiapkan rekomendasi SMTP kustom untuk pengujian dan produksi
- [ ] Menguji ulang reset password setelah masa rate limit atau SMTP tersedia

## Konfigurasi SMTP Kustom

- [ ] Memilih penyedia SMTP untuk KONSINYASI
- [ ] Membuat credential SMTP atau API key
- [ ] Memasukkan credential SMTP ke Supabase
- [ ] Menguji email konfirmasi dan reset password
- [ ] Menyimpan checkpoint konfigurasi SMTP

## Perencanaan Modul Inti KONSINYASI

- [ ] Memetakan peran pengguna dan alur bisnis konsinyasi
- [ ] Menentukan modul MVP prioritas
- [ ] Menentukan struktur data utama dan status transaksi
- [ ] Menetapkan keputusan modul untuk implementasi berikutnya

## Rekomendasi Navigasi Bawah

- [ ] Menentukan lima tab utama untuk alur KONSINYASI
- [ ] Memilih susunan tab final bersama pengguna
- [ ] Mengimplementasikan ikon dan navigasi bawah setelah keputusan disetujui

## Role dan Dashboard Terpisah

- [ ] Mendokumentasikan konteks, tujuan, batasan, dan output RBAC
- [x] Mendefinisikan role distributor, mitra UMKM, admin, supervisor, sales motoris, dan HRD
- [x] Menentukan dashboard khusus dan menu yang terlihat per role
- [x] Menentukan aturan bahwa role tidak dapat melihat data role lain
- [ ] Menentukan model data role dan kebijakan RLS Supabase
- [x] Menetapkan keputusan implementasi RBAC bersama pengguna

## Aturan Onboarding Hirarki Distributor

- [ ] Menetapkan pendaftaran email resmi sebagai pembuatan akun Distributor
- [ ] Menonaktifkan pendaftaran mandiri untuk role bawahan
- [x] Menentukan alur Admin membuat akun Mitra UMKM, Supervisor, Sales Motoris, dan HRD
- [x] Menentukan hubungan akun bawahan dengan Distributor pemilik
- [x] Menentukan status akun undangan, aktif, nonaktif, dan reset akses
- [x] Menetapkan guard berdasarkan distributor_id serta role; RLS Supabase menunggu tabel bisnis

## Manajemen Pengguna dan Hak Akses Role

- [x] Menambahkan menu Manajemen Pengguna pada dashboard Distributor
- [x] Menambahkan aksi Tambah Pengguna untuk seluruh role
- [x] Mengizinkan Distributor mengedit seluruh pengguna
- [x] Mengizinkan Distributor menghapus seluruh pengguna dengan perlindungan akun aktif terakhir
- [x] Mengizinkan Admin membuat role bawahan
- [x] Mengizinkan Admin mengedit role bawahan
- [x] Mencegah Admin membuat atau menghapus Distributor
- [x] Mencegah pengguna biasa mengakses Manajemen Pengguna
- [x] Menerapkan validasi hak akses di UI dan server; RLS Supabase menunggu tabel bisnis

## Akun Bawahan Ditentukan Admin

- [x] Menghapus ketergantungan alur undangan email untuk akun bawahan
- [x] Menambahkan form Admin untuk menentukan email login pengguna
- [x] Menentukan metode password awal atau password sementara
- [x] Memastikan pengguna bawahan tidak dapat mendaftar sendiri
- [x] Menjaga batasan Admin agar tidak dapat membuat atau menghapus Distributor

## Onboarding Berjenjang Distributor dan Admin

- [x] Distributor membuat akun Admin melalui Manajemen Pengguna
- [x] Distributor menentukan email login dan password awal Admin
- [x] Admin login memakai credential yang diberikan Distributor
- [x] Admin membuat akun Mitra UMKM, Supervisor, Sales Motoris, dan HRD
- [x] Membatasi Admin agar tidak membuat atau menghapus Distributor
- [x] Mewajibkan penggantian password awal pada login pertama

## Implementasi Onboarding Berjenjang

- [x] Meninjau skema dan hook autentikasi yang sudah ada
- [x] Menambahkan model role, status akun, dan distributor_id pada metadata Supabase
- [x] Membuat Manajemen Pengguna Distributor
- [x] Membuat Manajemen Pengguna Admin dengan role terbatas
- [x] Menambahkan pembuatan akun email/password melalui backend aman
- [x] Menambahkan aturan password awal dan wajib ganti password
- [ ] Menambahkan dashboard routing berdasarkan role
- [ ] Menambahkan guard UI, API, dan RLS untuk pembatasan akses
- [x] Menjalankan TypeScript, lint, dan test
- [ ] Menyimpan checkpoint onboarding berjenjang

## Pemulihan Dev Server

- [ ] Merestart dev server KONSINYASI
- [ ] Memeriksa status preview dan log startup setelah restart

## Stabilitas Dev Server Berulang

- [x] Merestart dev server setelah gangguan berulang
- [x] Memeriksa log dan kestabilan preview setelah restart

## Sinkronisasi GitHub

- [x] Memeriksa status dan remote repository GitHub
- [x] Membuat commit perubahan terbaru KONSINYASI
- [x] Push commit ke branch GitHub yang terhubung
- [x] Memverifikasi commit sudah tersedia di GitHub
