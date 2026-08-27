# Pengembalian Daftar Pengguna Inline

## Context

Pemisahan daftar pengguna ke layar khusus membuat alur Manajemen Pengguna berbeda dari tampilan sebelumnya. Pengguna meminta tampilan dikembalikan seperti semula, dengan daftar pengguna kembali berada di bawah form pada halaman yang sama.

## Tujuan

Mengembalikan daftar pengguna inline sambil mempertahankan form data lengkap, upload KTP, password, konfirmasi password, pembatasan satu Distributor, dan guard akses role.

## Batasan

Tidak membatalkan fitur backend, database, storage privat, atau validasi yang sudah dibangun. Layar user-list tidak lagi menjadi alur utama dan boleh dihapus setelah navigasi inline dipulihkan. Fungsi refresh, edit, ubah status, dan hapus harus tetap tersedia.

## Output

Manajemen Pengguna kembali menampilkan form Tambah Pengguna dan daftar pengguna pada satu halaman, seperti tampilan sebelumnya. Form tetap memakai field terbaru, sedangkan daftar tetap memakai data dari endpoint management.list.
