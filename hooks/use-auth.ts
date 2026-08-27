import { useMemo } from "react";

import { useSupabaseAuth } from "@/lib/supabase-auth-provider";

export type AppUser = {
  id: string;
  openId: string;
  name: string;
  email: string;
  loginMethod: "email";
  lastSignedIn: Date;
};

type UseAuthOptions = {
  autoFetch?: boolean;
};

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const { user: authUser, loading: sessionLoading, signOut } = useSupabaseAuth();

  const user = useMemo<AppUser | null>(() => {
    if (!authUser) return null;
    const metadata = authUser.user_metadata as { full_name?: string; name?: string } | undefined;
    const fallbackName = authUser.email?.split("@")[0] || "Pengguna KONSINYASI";
    return {
      id: authUser.id,
      openId: authUser.id,
      name: metadata?.full_name?.trim() || metadata?.name?.trim() || fallbackName,
      email: authUser.email ?? "",
      loginMethod: "email",
      lastSignedIn: new Date(authUser.last_sign_in_at ?? authUser.created_at),
    };
  }, [authUser]);

  const loading = autoFetch ? sessionLoading : false;
  const isAuthenticated = Boolean(user);

  return {
    user,
    loading,
    error: null,
    isAuthenticated,
    refresh: async () => undefined,
    logout: signOut,
  };
}
