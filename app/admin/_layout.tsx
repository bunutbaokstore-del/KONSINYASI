import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { AdminRouteGuard } from "@/components/admin-route-guard";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function AdminLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);

  return (
    <AdminRouteGuard>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          tabBarActiveBackgroundColor: `${colors.primary}14`,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: -0.2 },
          tabBarStyle: {
            paddingTop: 8,
            paddingBottom: bottomPadding,
            height: 56 + bottomPadding,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
          },
        }}
      >
      <Tabs.Screen name="index" options={{ title: "Beranda", tabBarIcon: ({ color }) => <IconSymbol size={22} name="house.fill" color={color} /> }} />
      <Tabs.Screen name="distribution" options={{ href: null }} />
      <Tabs.Screen name="operational" options={{ title: "Operasional", tabBarIcon: ({ color }) => <IconSymbol size={22} name="shippingbox.fill" color={color} /> }} />
      <Tabs.Screen name="lapangan" options={{ title: "Lapangan", tabBarIcon: ({ color }) => <IconSymbol size={22} name="building.2.fill" color={color} /> }} />
      <Tabs.Screen name="finance" options={{ title: "Keuangan", tabBarIcon: ({ color }) => <IconSymbol size={22} name="wallet.bifold.fill" color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "Akun", tabBarIcon: ({ color }) => <IconSymbol size={22} name="person.fill" color={color} /> }} />
      <Tabs.Screen name="rute" options={{ href: null }} />
      <Tabs.Screen name="wilayah" options={{ href: null }} />
      <Tabs.Screen name="products" options={{ href: null }} />
      </Tabs>
    </AdminRouteGuard>
  );
}
