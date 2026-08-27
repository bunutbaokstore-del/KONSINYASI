# Data Pengguna Lengkap KONSINYASI

## Context

Form Tambah Pengguna KONSINYASI perlu menyimpan informasi yang cukup untuk identitas, komunikasi, verifikasi, dan akses kerja. Semua pengguna dari enam role wajib memiliki foto KTP, sedangkan email tetap menjadi satu-satunya identitas untuk login Supabase Auth.

## Tujuan

Form akan mengumpulkan nama lengkap, email login, nomor HP, kontak darurat, alamat lengkap, foto KTP, role, password, dan konfirmasi password. Data tersebut harus disimpan terstruktur, terhubung ke Distributor pemilik, dan hanya dapat dilihat oleh pihak yang memiliki kewenangan.

## Struktur Data

| Kelompok | Data | Aturan |
|---|---|---|
| Identitas | Nama lengkap | Wajib, minimal 2 karakter |
| Autentikasi | Email login | Wajib, format email valid, unik, satu-satunya identitas login |
| Kontak | Nomor HP | Wajib, format nomor Indonesia yang valid |
| Kontak darurat | Nama, hubungan, nomor HP | Wajib untuk kebutuhan darurat |
| Alamat | Alamat lengkap | Wajib, cukup untuk kebutuhan operasional |
| Verifikasi | Foto KTP | Wajib untuk Distributor, Admin, Mitra UMKM, Supervisor, Sales Motoris, dan HRD |
| Akses | Role | Diatur sesuai hirarki Distributor/Admin |
| Keamanan | Password | Wajib, minimal 8 karakter; menjadi password login seterusnya |
| Keamanan | Konfirmasi password | Wajib sama dengan password; tidak disimpan sebagai data profil |

## Batasan dan Privasi

Email login dan password tetap diproses melalui Supabase Auth. Password dan konfirmasi password tidak boleh disimpan di tabel profil, metadata, log, atau storage aplikasi. Foto KTP harus berada di storage privat dan tidak menggunakan URL publik. Akses dokumen mengikuti ruang kerja: pengguna dapat mengakses dokumennya sendiri, sedangkan Distributor atau Admin dapat mengakses dokumen pengguna dalam ruang kerja yang menjadi kewenangannya.

Form tidak menggunakan username terpisah. Nama lengkap bukan identitas login. Upload KTP akan dibatasi ke gambar yang didukung, dengan ukuran file maksimum yang ditetapkan aplikasi, dan pengguna harus dapat membatalkan atau mengganti foto sebelum form dikirim.

## Output yang Diharapkan

Form Tambah Pengguna memiliki bagian Identitas, Kontak, Kontak Darurat, Alamat, Verifikasi KTP, dan Akses Login. Sistem menolak pembuatan akun jika kolom wajib tidak lengkap, email tidak valid, password tidak memenuhi aturan, konfirmasi tidak sama, atau KTP belum dipilih. Server membuat akun Auth dan menyimpan profil terverifikasi secara aman dengan hubungan ke Distributor pemilik.

## Keputusan Login

Email adalah satu-satunya identitas login. Jika di masa depan dibutuhkan username tampilan, username tersebut hanya menjadi atribut profil dan tidak dapat digunakan untuk masuk tanpa perubahan khusus pada arsitektur autentikasi.
