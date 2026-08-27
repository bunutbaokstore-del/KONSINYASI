# Fitur Akun Lanjutan KONSINYASI

## Context

KONSINYASI membutuhkan area akun yang lebih lengkap agar pengguna dapat memahami identitasnya, mengakses pengaturan keamanan, membuat akun baru, dan mendapatkan kembali akses ketika lupa kata sandi. Fitur ini memperluas versi awal yang sebelumnya hanya menyediakan login dan Home.

## Tujuan

Tujuan utama fitur adalah menyediakan pengalaman akun yang terstruktur dan mudah digunakan pada Android portrait. Pengguna dapat melihat profilnya, keluar dengan aman, membuka alur pendaftaran, memvalidasi data dasar sebelum dikirim, serta memulai alur pemulihan kata sandi melalui email. Navigasi dibuat ringkas agar aksi utama dapat dijangkau dengan satu tangan.

## Batasan

Implementasi saat ini mengikuti infrastruktur autentikasi yang tersedia di proyek, yaitu Manus OAuth dengan penyimpanan sesi native. Layar pendaftaran sudah menyediakan input nama, email, kata sandi, validasi lokal, dan penerusan ke layanan autentikasi resmi. Layar pemulihan sudah menyediakan input email, validasi, dan state konfirmasi di aplikasi.

Pendaftaran dengan kredensial email/password secara penuh dan pengiriman email reset kata sandi belum dapat dianggap aktif karena proyek belum memiliki endpoint backend email/password, penyimpanan hash kata sandi, token reset sekali pakai, serta provider email transaksional. State konfirmasi pemulihan saat ini adalah kesiapan UI; koneksi produksi harus ditambahkan setelah kontrak API dan layanan email disediakan. Password tidak disimpan oleh aplikasi.

## Output

Output fitur mencakup tab Profil dengan avatar inisial, nama, email, status verifikasi, menu data profil, keamanan, bantuan, dan logout. Output berikutnya adalah layar Pendaftaran Akun dengan validasi nama, email, dan kata sandi minimal delapan karakter, serta layar Pemulihan Kata Sandi dengan validasi email dan state permintaan siap diproses.

Dokumentasi desain dan pekerjaan tersimpan di `design.md` dan `todo.md`. Pemeriksaan TypeScript dan lint berhasil tanpa error. Test bawaan logout masih skipped karena memerlukan sesi runtime yang tidak tersedia dalam lingkungan pemeriksaan otomatis.

## Keputusan Teknis

| Area | Keputusan |
|---|---|
| Platform | Android portrait melalui Expo React Native |
| Navigasi | Expo Router dengan tab Home dan Profil serta route terpisah untuk register dan forgot-password |
| Auth saat ini | Manus OAuth dan sesi native dari template |
| Validasi | Validasi lokal sebelum aksi autentikasi |
| Penyimpanan password | Tidak disimpan di perangkat |
| Integrasi produksi yang tersisa | Endpoint email/password dan provider email reset |
