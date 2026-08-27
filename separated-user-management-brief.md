# Pemisahan Form Tambah Pengguna dan Daftar Pengguna

## Context

Halaman Manajemen Pengguna saat ini menampilkan form Tambah Pengguna dan daftar pengguna pada layar yang sama. Form kini memuat data profil lengkap, kontak darurat, foto KTP wajib, role, password, dan konfirmasi password, sehingga daftar pengguna di bawahnya membuat halaman terlalu panjang dan kurang fokus.

## Tujuan

Form Tambah Pengguna hanya digunakan untuk mengisi dan membuat akun baru. Daftar pengguna dipindahkan ke tampilan khusus agar Distributor dan Admin tetap dapat melihat, mengedit, menonaktifkan, dan menghapus pengguna tanpa memenuhi form input.

## Batasan

Data pengguna tidak dihapus dari sistem. Pembatasan role tetap berlaku: Distributor utama tidak dapat dibuat ulang, Admin hanya mengelola role bawahan, dan pengguna biasa tidak dapat membuka area manajemen. Perubahan hanya mengatur presentasi dan navigasi, bukan mengurangi keamanan server atau RLS Supabase.

## Output

Tampilan Manajemen Pengguna memiliki akses terpisah ke Tambah Pengguna dan Daftar Pengguna. Setelah akun dibuat, pengguna dapat kembali ke menu manajemen tanpa daftar panjang di bawah form. Daftar khusus mempertahankan refresh, edit, nonaktifkan, hapus, loading, error, dan empty state.
