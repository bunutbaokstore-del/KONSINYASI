# Audit Mutasi Stok dan Notifikasi

## Audit Mutasi Stok

Setiap perubahan pada stok resmi menyimpan barang, Mitra supplier, stok sebelum, jumlah perubahan, stok sesudah, tipe mutasi, alasan, pengguna yang menyetujui, dan waktu kejadian. Audit hanya dibuat ketika Admin menyetujui barang baru atau perubahan stok, sehingga pengajuan pending tidak mengubah stok resmi.

## Notifikasi In-App

Notifikasi dibuat ketika request supplier disetujui atau ditolak. Notifikasi dikirim kepada Mitra pemilik request dan dapat dibaca Admin pada daftar pengajuan. Notifikasi memiliki judul, isi, tipe, status sudah dibaca, dan waktu dibuat.

## Akses

Mitra hanya membaca audit dan notifikasi miliknya. Admin/Distributor membaca audit serta notifikasi dalam `distributor_id` ruang kerjanya. Tidak ada push notification atau pengiriman email pada tahap ini; fitur ini adalah notifikasi in-app yang muncul saat layar memuat ulang data.
