import ProfileScreen from "@/app/(tabs)/profile";
import { SysAdminRouteGuard } from "@/components/sysadmin-route-guard";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator } from "react-native";

export default function AdminSysAkunScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace("/" as never);
  }, [isAuthenticated, loading, router]);

  if (loading || !isAuthenticated) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <SysAdminRouteGuard>
      <ProfileScreen />
    </SysAdminRouteGuard>
  );
}