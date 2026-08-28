# Modul Barang Titipan dan Status Stok Mitra UMKM

## Context

Dashboard Mitra UMKM saat ini hanya menampilkan sambutan dan identitas akun. Mitra membutuhkan ringkasan barang titipan yang menjadi tanggung jawabnya serta kondisi stok terkini.

## Model Data

Setiap barang memiliki nama barang, kode barang opsional, satuan, jumlah stok saat ini, batas stok minimum, status, distributor pemilik ruang kerja, mitra pemilik barang, dan waktu pembaruan.

Status stok dihitung server dari jumlah stok dan batas minimum:

| Status | Aturan | Makna |
|---|---|---|
| Aman | stok > minimum | Persediaan mencukupi |
| Menipis | stok > 0 dan stok <= minimum | Perlu diperhatikan atau segera diisi |
| Habis | stok = 0 | Tidak ada persediaan |

## Scope MVP

Versi pertama menampilkan daftar barang titipan dan ringkasan jumlah barang, total unit, serta jumlah barang berdasarkan status stok. Mutasi stok dan pembuatan barang dari dashboard Mitra UMKM belum menjadi bagian dari tahap ini; data awal harus berasal dari API/database dan bukan angka tiruan.

## Isolasi Akses

Mitra UMKM hanya dapat membaca barang yang memiliki distributor_id dan mitra_user_id sesuai identitasnya. Distributor dan Admin tidak kehilangan kewenangan manajemen, tetapi endpoint dashboard Mitra dibatasi untuk data ruang kerja terkait. Role lain tidak dapat melihat dashboard atau data barang Mitra UMKM melalui endpoint tersebut.

## Output UI

Dashboard menampilkan kartu ringkasan stok, chip status stok, daftar barang dalam FlatList, state loading, error, empty state, dan refresh. Saat belum ada barang, aplikasi menampilkan pesan informatif tanpa angka placeholder.
