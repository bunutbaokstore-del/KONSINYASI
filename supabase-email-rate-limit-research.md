# Temuan Email Rate Limit Supabase

Tanggal: 27 Agustus 2026

Supabase mendokumentasikan bahwa layanan email bawaan untuk Auth memiliki batas pengiriman rendah dan bersifat best-effort. Dokumentasi rate limits menyebutkan layanan email bawaan dibatasi sekitar 2 email per jam, dan perubahan batas tersebut memerlukan custom SMTP.

Dokumentasi resmi:

1. [Rate limits](https://supabase.com/docs/guides/auth/rate-limits)
2. [Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
3. [Password-based Auth](https://supabase.com/docs/guides/auth/passwords)

Implikasi untuk KONSINYASI: error `email rate limit exceeded` kemungkinan besar disebabkan pengujian berulang menggunakan email reset yang sama pada layanan email bawaan. Pengguna perlu menunggu hingga jendela rate limit berakhir atau mengonfigurasi custom SMTP. Aplikasi tidak boleh mencoba mengakali rate limit dengan mengirim permintaan berulang.
