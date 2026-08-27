import { useMemo } from "react";

import { useSupabaseAuth } from "@/lib/supabase-auth-provider";
import { roleFromMetadata } from "@/shared/auth";
import type { AppRole, AccountStatus } from "@/shared/auth";

export type AppUser = {
  id: string;
  openId: string;
  name: string;
  email: string;
  loginMethod: "email";
  lastSignedIn: Date;
  role: AppRole;
  status: AccountStatus;
  distributorId: string;
  mustChangePassword: boolean;
};

type UseAuthOptions = {
  autoFetch?: boolean;
};

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const { user: authUser, loading: sessionLoading, signOut } = useSupabaseAuth();

  const user = useMemo<AppUser | null>(() => {
    if (!authUser) return null;
    const metadata = authUser.user_metadata as { full_name?: string; name?: string; must_change_password?: unknown } | undefined;
    const appMetadata = authUser.app_metadata as { role?: unknown; status?: unknown; distributor_id?: unknown; must_change_password?: unknown } | undefined;
    const role = roleFromMetadata(appMetadata?.role);
    const fallbackName = authUser.email?.split("@")[0] || "Pengguna KONSINYASI";
    const distributorId = typeof appMetadata?.distributor_id === "string" ? appMetadata.distributor_id : authUser.id;
    return {
      id: authUser.id,
      openId: authUser.id,
      name: metadata?.full_name?.trim() || metadata?.name?.trim() || fallbackName,
      email: authUser.email ?? "",
      loginMethod: "email",
      lastSignedIn: new Date(authUser.last_sign_in_at ?? authUser.created_at),
      role,
      status: appMetadata?.status === "disabled" ? "disabled" : "active",
      distributorId,
      mustChangePassword: appMetadata?.must_change_password === true || metadata?.must_change_password === true,
    };
  }, [authUser]);

  const loading = autoFetch ? sessionLoading : false;
  const isAuthenticated = Boolean(user) && user?.status !== "disabled";

  return {
    user,
    loading,
    error: null,
    isAuthenticated,
    refresh: async () => undefined,
    logout: signOut,
  };
}
