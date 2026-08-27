# Password Tetap untuk Akun Bawahan KONSINYASI

## Context

Dalam alur onboarding KONSINYASI, Distributor atau Admin membuat akun bawahan dengan menentukan email login dan password. Implementasi sebelumnya memperlakukan password tersebut sebagai password awal dan mengharuskan pengguna menggantinya ketika login pertama. Aturan bisnis yang baru menetapkan bahwa password yang diberikan oleh Distributor atau Admin adalah password yang akan digunakan seterusnya oleh pengguna.

## Tujuan

Perubahan ini menghilangkan konsep password awal dan kewajiban mengganti password pada login pertama. Label, helper text, metadata akun, dan routing autentikasi harus menjelaskan bahwa password yang ditentukan pengelola merupakan password login tetap sampai pengguna atau pengelola mengubahnya melalui alur perubahan password yang tersedia.

## Batasan

Password tetap hanya mengubah alur onboarding akun bawahan. Validasi minimum password, penyimpanan aman oleh Supabase Auth, kontrol akses role, dan fitur pemulihan password tetap dipertahankan. Password tidak boleh ditampilkan kembali oleh aplikasi setelah akun dibuat dan tidak boleh dicetak ke log.

Distributor atau Admin tetap bertanggung jawab menyampaikan email login dan password kepada pengguna melalui jalur pribadi yang aman. Pengguna tetap dapat mengganti password secara sukarela melalui fitur pengaturan akun atau pemulihan password jika fitur tersebut tersedia.

## Output

Form Manajemen Pengguna menampilkan label **Password** atau **Kata sandi**, bukan **Password awal**, dan helper text tidak lagi menyatakan bahwa password hanya berlaku untuk login pertama. Server membuat akun tanpa metadata `must_change_password: true`, dan login tidak lagi mengarahkan pengguna baru ke layar wajib ganti password. Layar Change Password tetap dapat dipakai untuk perubahan password yang dilakukan secara sukarela atau melalui kebijakan keamanan di masa mendatang.

## Acceptance Criteria

| Kriteria | Hasil yang diharapkan |
|---|---|
| Form pengelola | Label dan penjelasan tidak memakai istilah password awal |
| Pembuatan akun | Password yang ditentukan pengelola menjadi credential login akun |
| Login pertama | Pengguna langsung masuk ke dashboard sesuai role |
| Metadata | Akun baru tidak diberi flag wajib ganti password |
| Keamanan | Password tetap tidak dicetak, disimpan lokal, atau ditampilkan ulang oleh aplikasi |
| Validasi | Minimum 8 karakter dan aturan role tetap berlaku |
| Pemulihan | Forgot Password dan Reset Password tetap bekerja |
