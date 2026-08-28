# Form Admin Barang Titipan

## Tujuan

Admin dapat membuat, melihat, mengubah, dan menghapus barang titipan yang ditugaskan kepada Mitra UMKM dalam ruang kerja Distributor yang sama.

## Field Form

| Field | Wajib | Aturan |
|---|---:|---|
| Mitra UMKM | Ya | Hanya pengguna role mitra_umkm dalam ruang kerja yang sama |
| Nama barang | Ya | 1–160 karakter |
| Kode barang | Tidak | Maksimal 80 karakter |
| Satuan | Ya | Default pcs, 1–40 karakter |
| Stok saat ini | Ya | Bilangan bulat minimal 0 |
| Batas minimum stok | Ya | Bilangan bulat minimal 0 |

## Status Stok

Status dihitung dari stok saat ini: Habis jika stok 0, Menipis jika stok lebih dari 0 dan tidak melebihi batas minimum, serta Aman jika stok melebihi batas minimum.

## Alur

Admin membuka Kelola Barang Titipan, menekan Tambah Barang, memilih Mitra UMKM, mengisi field, lalu menyimpan. Data baru langsung tersedia pada dashboard Mitra terkait. Edit memperbarui data yang sama, sedangkan hapus meminta konfirmasi dan menghapus item dari ruang kerja.

## Keamanan

Semua operasi memakai session Supabase dan validasi server. Admin hanya dapat mengelola data dalam distributor_id miliknya dan hanya dapat memilih Mitra UMKM dalam ruang kerja tersebut. Role lain ditolak oleh server.
