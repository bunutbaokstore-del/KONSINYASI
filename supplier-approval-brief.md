# Alur Supplier Mitra UMKM dan Persetujuan Admin

## Peran

Mitra UMKM adalah supplier yang menyediakan barang. Mitra hanya dapat membaca barang yang terhubung ke `mitra_user_id` miliknya dalam `distributor_id` ruang kerjanya. Admin dan Distributor mengelola pencatatan resmi melalui server.

## Pengajuan

Mitra mengajukan barang baru atau perubahan stok melalui request. Request menyimpan jenis pengajuan, barang terkait bila ada, nilai yang diusulkan, alasan, dan status pending/approved/rejected. Mitra tidak menulis langsung ke tabel barang.

## Persetujuan

Admin memeriksa request pending. Jika menyetujui barang baru, server membuat barang resmi. Jika menyetujui perubahan stok, server memperbarui stok barang lalu menandai request approved. Jika menolak, server hanya menyimpan status rejected dan catatan Admin.

## Akses

Admin/Distributor dapat melihat request dalam distributor_id mereka. Mitra hanya dapat melihat request miliknya dan barang miliknya. Role lain tidak dapat mengakses endpoint supplier. Direct insert/update/delete pada tabel barang oleh authenticated user dinonaktifkan; mutasi resmi berjalan melalui endpoint server yang tervalidasi.

## Status stok

Status Aman, Menipis, dan Habis tetap dihitung dari stok resmi yang telah disetujui. Pengajuan pending tidak mengubah stok resmi sampai disetujui Admin.
