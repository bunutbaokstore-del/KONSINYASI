# Pembatasan Role Distributor Tunggal KONSINYASI

## Context

Dalam sistem KONSINYASI, role **Distributor** merupakan pemilik tertinggi dari sebuah ruang kerja (workspace). Saat ini, pada menu Manajemen Pengguna, seorang Distributor masih memiliki pilihan untuk membuat akun baru dengan role Distributor. Hal ini tidak sesuai dengan model bisnis di mana satu ruang kerja hanya dikelola oleh satu entitas Distributor utama.

## Tujuan

Tujuan dari perubahan ini adalah untuk menghilangkan pilihan role **Distributor** dari form pendaftaran pengguna baru di dalam aplikasi. Dengan demikian, Distributor hanya dapat membuat akun untuk role bawahan (Admin, Mitra UMKM, Supervisor, Sales Motoris, dan HRD). Hal ini memastikan integritas hirarki dan mencegah adanya duplikasi pemilik dalam satu ruang kerja.

## Batasan

Perubahan ini hanya berlaku pada form **Tambah pengguna** dan **Edit pengguna** di dalam aplikasi. Akun Distributor utama yang sudah ada tetap dipertahankan dan tidak dapat dihapus atau diubah rolenya menjadi role lain melalui menu Manajemen Pengguna. Validasi juga akan diterapkan pada sisi server untuk mencegah pembuatan role Distributor melalui API.

## Output

Output yang dihasilkan adalah pembaruan pada layar `manage-users.tsx` di mana pilihan role Distributor tidak lagi muncul dalam daftar pilihan role. Selain itu, logika pada `server/routers.ts` akan diperbarui untuk menolak permintaan pembuatan akun dengan role Distributor.

## Ringkasan Perubahan Hirarki

| Role Pengelola | Role yang Dapat Dibuat/Dikelola | Role yang Dilarang |
|---|---|---|
| **Distributor** | Admin, Mitra UMKM, Supervisor, Sales Motoris, HRD | Distributor |
| **Admin** | Mitra UMKM, Supervisor, Sales Motoris, HRD | Distributor, Admin |
