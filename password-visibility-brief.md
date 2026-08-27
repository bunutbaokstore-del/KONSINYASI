# Fitur Tampil/Sembunyikan Password KONSINYASI

## Context

KONSINYASI memiliki beberapa alur autentikasi dan manajemen pengguna yang menggunakan kolom password, termasuk login, pendaftaran, pemulihan atau penggantian password, serta pembuatan akun bawahan oleh Distributor atau Admin. Password saat ini perlu dapat diperiksa secara visual ketika pengguna salah mengetik atau ingin memastikan password awal yang akan digunakan.

## Tujuan

Fitur ini menambahkan tombol ikon mata pada setiap kolom password. Pengguna dapat mengetuk ikon tersebut untuk mengubah tampilan password antara karakter tersembunyi dan teks yang terlihat. Kontrol dibuat konsisten pada seluruh layar yang memiliki input password, mudah digunakan dengan satu tangan, memiliki label aksesibilitas, dan tidak mengubah nilai password atau proses autentikasi.

## Batasan

Perubahan hanya mencakup tampilan dan interaksi lokal pada input password. Nilai password tetap diproses menggunakan mekanisme autentikasi yang sudah ada dan tidak disimpan dalam bentuk teks biasa. Fitur tidak menambahkan mekanisme penyimpanan password, tidak mengubah aturan validasi password, dan tidak mengubah role-based access control.

Setiap kolom password memiliki state tampil/sembunyinya sendiri. Password tetap tersembunyi secara default ketika layar dibuka. Perubahan konfigurasi native Android, server, database, dan SMTP tidak termasuk dalam fitur ini.

## Output

Output yang diharapkan adalah ikon mata pada semua kolom password di layar Login, Register, Forgot Password atau alur terkait, Change Password, dan form Tambah Pengguna. Ikon berubah antara keadaan terlihat dan tersembunyi, tombol memiliki area sentuh yang memadai, dan setiap keadaan memiliki label aksesibilitas Bahasa Indonesia. TypeScript, lint, dan test aplikasi harus tetap berhasil.

## Acceptance Criteria

| Kriteria | Hasil yang diharapkan |
|---|---|
| Default | Password tersembunyi ketika layar dibuka |
| Toggle | Ketukan ikon mengubah password terlihat atau tersembunyi |
| Nilai input | Nilai password tidak berubah ketika toggle digunakan |
| Banyak kolom | Setiap kolom password dapat dikontrol secara independen |
| Aksesibilitas | Tombol memiliki label yang menjelaskan aksi saat ini |
| Keamanan | Tidak ada password yang dicetak ke log atau disimpan oleh fitur ini |
| Kompatibilitas | TypeScript, lint, test, dan bundle tetap berhasil |
