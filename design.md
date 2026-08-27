# Rancangan Interface Mobile KONSINYASI

## Arah Produk

KONSINYASI adalah aplikasi Android untuk pengguna yang memerlukan akses akun secara cepat dan aman. Versi awal berfokus pada autentikasi pengguna melalui Manus OAuth dan halaman awal yang menjadi titik masuk setelah login. Seluruh layar dirancang untuk orientasi portrait 9:16, target sentuhan yang nyaman, dan penggunaan satu tangan.

## Screen List

| Layar | Tujuan | Konten dan fungsi utama |
|---|---|---|
| Login | Memulai autentikasi pengguna | Logo KONSINYASI, judul sambutan, penjelasan singkat, tombol masuk, status loading dan pesan kesalahan |
| OAuth Callback | Menyelesaikan proses autentikasi | Layar transisi yang menangani callback deep link dan mengarahkan pengguna ke Home; tidak mengubah file callback bawaan tanpa kebutuhan |
| Home | Menampilkan status akun setelah login | Sapaan personal berdasarkan nama pengguna, kartu status akun, tombol keluar, dan ruang yang siap dikembangkan untuk fitur konsinyasi berikutnya |

## Layout dan Hierarki Visual

Layar Login menggunakan latar putih hangat dengan aksen hijau tua sebagai warna kepercayaan dan pertumbuhan. Logo diletakkan di bagian atas tengah dalam ukuran besar, diikuti judul “Selamat datang di KONSINYASI” dan subjudul singkat yang menjelaskan bahwa pengguna dapat masuk untuk melanjutkan. Area utama berada di tengah layar agar tombol mudah dijangkau ibu jari, sedangkan tombol masuk menggunakan lebar penuh dengan tinggi minimal 52 dp dan sudut 16 dp.

Layar Home menggunakan header ringkas dengan nama aplikasi dan kontrol keluar di sisi kanan. Konten utama memakai kartu permukaan putih dengan border halus, radius 20 dp, dan padding 20 dp. Sapaan berada di bagian atas, lalu kartu status yang menampilkan identitas pengguna yang tersedia. Spasi vertikal dibuat longgar agar antarmuka mudah dipindai pada layar Android berukuran kecil.

## Key User Flows

### Masuk ke aplikasi

1. Pengguna membuka KONSINYASI dan melihat layar Login.
2. Pengguna menekan tombol “Masuk dengan akun”.
3. Aplikasi membuka alur Manus OAuth melalui browser autentikasi sistem.
4. Setelah autentikasi berhasil, callback deep link mengembalikan pengguna ke KONSINYASI.
5. Token sesi disimpan secara aman oleh mekanisme autentikasi native.
6. Aplikasi mengarahkan pengguna ke Home dan menampilkan nama akun jika tersedia.

### Keluar dari aplikasi

1. Pengguna menekan kontrol “Keluar” pada Home.
2. Aplikasi menjalankan logout dan menghapus sesi lokal.
3. Aplikasi mengarahkan pengguna kembali ke Login.
4. Jika logout gagal, aplikasi menampilkan pesan kesalahan yang dapat dipahami pengguna.

### Penanganan kondisi loading dan error

Saat sesi sedang diperiksa, aplikasi menampilkan indikator aktivitas yang tenang tanpa tombol yang dapat ditekan berulang kali. Saat autentikasi gagal atau dibatalkan, layar Login menampilkan pesan ringkas dan tombol dapat digunakan kembali. Pesan tidak menampilkan detail teknis atau token.

## Color Choices

| Token | Warna | Penggunaan |
|---|---|---|
| Primary | `#176B52` | Tombol utama, aksen brand, ikon aktif |
| Primary dark | `#0F4C3A` | Teks aksen gelap dan keadaan ditekan |
| Background | `#F7F8F4` | Latar utama yang lembut |
| Surface | `#FFFFFF` | Kartu, bidang input, dan area konten |
| Foreground | `#14231D` | Judul dan teks utama |
| Muted | `#64736B` | Deskripsi dan informasi sekunder |
| Border | `#DCE5DF` | Garis bidang dan pemisah |
| Success | `#2F8F62` | Status berhasil |
| Error | `#C94A4A` | Pesan kegagalan |

## Prinsip Interaksi

Tombol utama memakai umpan balik tekan berupa sedikit pengurangan skala dan opacity. Haptic feedback digunakan hanya untuk aksi utama jika berjalan pada perangkat Android. Semua input dan tombol memiliki label yang jelas, kontras yang memadai, dan state disabled saat proses autentikasi berlangsung. Navigasi tidak menggunakan gesture yang wajib dipahami pengguna; setiap alur penting memiliki kontrol eksplisit.

## Batasan Versi Awal

Versi awal tidak menambahkan fitur konsinyasi seperti inventaris, transaksi, laporan, atau sinkronisasi data sebelum kebutuhan bisnis tersebut dijelaskan lebih lanjut. Login menggunakan mekanisme autentikasi yang sudah tersedia dalam template proyek, bukan kredensial hardcode atau penyimpanan password buatan sendiri.
