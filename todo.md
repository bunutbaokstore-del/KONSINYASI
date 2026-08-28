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

## Sinkronisasi GitHub Terbaru

- [x] Memeriksa status branch dan perubahan lokal
- [x] Membuat commit perubahan terbaru
- [x] Push commit ke branch main GitHub
- [x] Memverifikasi commit terbaru di GitHub

## Fitur Visibility Password

- [x] Menambahkan tombol ikon mata pada seluruh kolom password
- [x] Menjaga password tersembunyi secara default dan state tiap kolom tetap independen
- [x] Menambahkan label aksesibilitas Bahasa Indonesia pada tombol visibility
- [x] Memvalidasi TypeScript, lint, test, dan bundle setelah perubahan

## Pembatasan Distributor Tunggal

- [x] Mendokumentasikan aturan satu Distributor per ruang kerja
- [x] Menghapus pilihan role Distributor dari form Tambah Pengguna
- [x] Menolak pembuatan akun Distributor pada validasi server
- [x] Memastikan akun Distributor aktif tidak dapat dihapus atau diturunkan rolenya
- [x] Memvalidasi TypeScript, lint, test, dan alur Manajemen Pengguna

## Password Tetap Akun Bawahan

- [x] Mendokumentasikan aturan password tetap
- [x] Menghapus penetapan wajib ganti password saat membuat akun
- [x] Menghapus redirect login ke Change Password untuk akun bawahan baru
- [x] Mengubah label dan penjelasan Password awal pada Manajemen Pengguna
- [x] Memvalidasi login, TypeScript, lint, dan test

## Data Pengguna Lengkap dan KTP

- [x] Mendokumentasikan struktur data profil, kontak, dan KTP
- [x] Menyiapkan tabel profil pengguna dan kontak darurat
- [x] Menyiapkan storage privat untuk foto KTP
- [x] Menambahkan field identitas, kontak, alamat, dan KTP pada form Tambah Pengguna
- [x] Menambahkan password dan konfirmasi password dengan validasi kecocokan
- [x] Mewajibkan upload KTP untuk semua role
- [x] Menerapkan pembatasan akses data profil dan dokumen KTP
- [x] Memastikan form pendaftaran Distributor juga mengumpulkan profil lengkap dan KTP wajib
- [x] Memvalidasi TypeScript, lint, dan test
- [ ] Menguji alur pendaftaran Distributor dan Tambah Pengguna di Android secara manual

## Barang Titipan dan Status Stok Mitra UMKM

- [x] Mendokumentasikan model barang, jumlah stok, dan status stok
- [x] Menyiapkan tabel barang titipan dengan isolasi distributor dan mitra
- [x] Menambahkan API daftar barang dan ringkasan status stok
- [x] Menambahkan kartu daftar barang titipan pada dashboard Mitra UMKM
- [x] Menambahkan ringkasan jumlah stok dan status stok
- [x] Menangani loading, error, empty state, dan refresh
- [x] Memvalidasi isolasi role dan data ruang kerja
- [x] Menjalankan TypeScript, lint, test, dan build
- [ ] Menguji tampilan dashboard Mitra UMKM di Android secara manual

## Pengelolaan Barang Titipan oleh Admin

- [x] Mendokumentasikan field dan alur CRUD barang titipan
- [x] Menambahkan API daftar, tambah, edit, dan hapus barang untuk Admin
- [x] Menerapkan validasi stok, batas minimum, satuan, dan ruang kerja
- [x] Membuat form Admin untuk barang titipan
- [x] Menampilkan daftar barang Admin dengan status stok
- [x] Menjaga dashboard Mitra menerima perubahan data barang
- [x] Menjalankan TypeScript, lint, test, dan build
- [ ] Menguji form Admin dan dashboard Mitra di Android secara manual

## Alur Supplier Mitra dan Persetujuan Admin

- [x] Mendokumentasikan Mitra UMKM sebagai supplier
- [x] Membuat model pengajuan barang dari Mitra ke Admin
- [x] Membuat model pengajuan perubahan stok dengan status persetujuan
- [x] Membatasi Mitra agar hanya melihat barang miliknya
- [x] Mencegah Mitra mengubah stok atau data barang secara langsung
- [x] Menambahkan persetujuan Admin sebelum barang/stok menjadi resmi
- [x] Menyesuaikan dashboard Admin dan Mitra dengan alur pengajuan
- [x] Menjalankan TypeScript, lint, test, dan build
- [ ] Menguji alur persetujuan di Android secara manual

## Audit Mutasi Stok dan Notifikasi

- [x] Mendokumentasikan struktur audit stok dan notifikasi
- [x] Menyiapkan tabel riwayat mutasi stok dengan RLS
- [x] Menyiapkan tabel notifikasi in-app dengan RLS
- [x] Mencatat audit dan membuat notifikasi setelah request diproses
- [x] Menambahkan layar riwayat mutasi stok
- [x] Menambahkan tampilan notifikasi untuk Mitra dan Admin
- [x] Menandai notifikasi sudah dibaca
- [x] Menjalankan TypeScript, lint, test, dan build
- [ ] Menguji audit dan notifikasi di Android secara manual

## Pengembalian Daftar Pengguna Inline

- [x] Mendokumentasikan permintaan pengembalian tampilan
- [x] Mengembalikan daftar pengguna ke bawah form Manajemen Pengguna
- [x] Memulihkan fungsi refresh, edit, ubah status, dan hapus pada halaman yang sama
- [x] Menghapus navigasi utama ke tampilan Daftar Pengguna terpisah
- [x] Memvalidasi TypeScript, lint, dan test; tampilan Android manual menunggu

## Pemisahan Tambah Pengguna dan Daftar Pengguna

- [x] Mendokumentasikan alur tampilan terpisah
- [x] Membuat tampilan Daftar Pengguna khusus
- [x] Memindahkan fungsi list, refresh, edit, dan hapus ke tampilan khusus
- [x] Menyederhanakan Manajemen Pengguna agar form tidak menampilkan daftar di bawahnya
- [x] Menjaga guard role dan validasi server yang sudah ada
- [x] Memvalidasi TypeScript, lint, dan test; navigasi Android manual menunggu
