export type SupabaseAuthErrorLike = {
  message: string;
  code?: string;
  status?: number;
};

export function formatSupabaseAuthError(error: SupabaseAuthErrorLike | null) {
  if (!error) return null;
  const code = error.code?.toLowerCase();
  if (code === "invalid_credentials" || code === "invalid_grant") {
    return "Email atau kata sandi tidak benar. Periksa kembali dan coba lagi.";
  }
  if (code === "email_not_confirmed") {
    return "Email belum dikonfirmasi. Periksa kotak masuk email Anda sebelum login.";
  }
  if (code === "user_banned") {
    return "Akun ini sedang dinonaktifkan. Hubungi Admin KONSINYASI.";
  }
  if (code === "over_request_rate_limit" || code === "too_many_requests") {
    return "Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.";
  }
  if (/network request failed|fetch failed|failed to fetch/i.test(error.message)) {
    return "Tidak dapat terhubung ke Supabase. Periksa koneksi internet lalu coba lagi.";
  }
  return error.message || "Login gagal. Silakan coba lagi.";
}
