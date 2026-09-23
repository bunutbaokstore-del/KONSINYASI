import { Stack } from "expo-router";

import { SysAdminRouteGuard } from "@/components/sysadmin-route-guard";

export default function AdminSysLayout() {
  return (
    <SysAdminRouteGuard>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="geography" />
      </Stack>
    </SysAdminRouteGuard>
  );
}