import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isSysAdmin = user?.platformRole === "sys_admin";
  const isAdmin = !isSysAdmin && user?.role === "admin";
  const isMitra = !isSysAdmin && user?.role === "mitra_umkm";
  const isDistributor = !isSysAdmin && user?.role === "distributor";
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: isMitra ? colors.primary : colors.tint,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: isMitra ? `${colors.primary}14` : undefined,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isMitra ? "Beranda" : "Home",
          href: isAdmin ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: isMitra ? "Distribusi" : "Produk",
          href: isAdmin ? null : isMitra ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="shippingbox.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="production"
        options={{
          title: "Produksi",
          href: isAdmin ? null : isMitra ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="building.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: "Keuangan",
          href: isAdmin ? null : isMitra ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="wallet.bifold.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="persetujuan"
        options={{
          title: "Persetujuan",
          href: isAdmin ? null : isMitra ? null : isDistributor ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="paperplane.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="operasional"
        options={{
          title: "Operasional",
          href: isAdmin ? null : isMitra ? null : isDistributor ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="shippingbox.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="keuangan"
        options={{
          title: "Keuangan",
          href: isAdmin ? null : isMitra ? null : isDistributor ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="wallet.bifold.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          href: isAdmin ? null : undefined,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
