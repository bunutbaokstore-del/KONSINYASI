import { useRouter } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";

export function SysAdminRouteGuard({ children }: { children: ReactNode }) {
  const colors = useColors();
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();
  const isSysAdmin = user?.platformRole === "sys_admin";

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !isSysAdmin) {
      router.replace("/" as never);
    }
  }, [isSysAdmin, isAuthenticated, loading, router]);

  if (loading || !isAuthenticated || !isSysAdmin) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return <>{children}</>;
}