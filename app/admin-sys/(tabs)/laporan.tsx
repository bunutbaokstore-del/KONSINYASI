import { SysAdminRouteGuard } from "@/components/sysadmin-route-guard";
import { ScreenContainer } from "@/components/screen-container";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

type AdminModuleItem = {
  title: string;
  description: string;
  icon: AppIconName;
  route?: string;
};

const LAPORAN_ITEMS: AdminModuleItem[] = [
  { title: "Revenue Platform", description: "Laporan pendapatan platform dari semua tenant", icon: "chart-bar" },
];

export default function AdminSysLaporanScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <SysAdminRouteGuard>
      <ScreenContainer className="px-6">
        <View style={styles.content}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>SYSADMIN</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Laporan</Text>
          <Text style={[styles.description, { color: colors.muted }]}>Pantau performa finansial platform dan tenant Distributor.</Text>
          <View style={styles.menuList}>
            {LAPORAN_ITEMS.map((item) => (
              <Pressable
                key={item.title}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                disabled={!item.route}
                onPress={() => item.route && router.push(item.route as never)}
                style={({ pressed }) => [
                  styles.menuRow,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && styles.pressed,
                  !item.route && styles.disabled,
                ]}
              >
                <View style={[styles.iconBox, { backgroundColor: `${colors.primary}18` }]}>
                  <AppIcon name={item.icon} size={21} color={colors.primary} />
                </View>
                <View style={styles.copy}>
                  <Text style={[styles.itemTitle, { color: colors.foreground }]}>{item.title}</Text>
                  <Text style={[styles.itemDescription, { color: colors.muted }]}>{item.description}</Text>
                </View>
                {item.route ? <AppIcon name="chevron-right" size={20} color={colors.muted} /> : <Text style={[styles.badge, { color: colors.muted, borderColor: colors.border }]}>Segera</Text>}
              </Pressable>
            ))}
          </View>
        </View>
      </ScreenContainer>
    </SysAdminRouteGuard>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingTop: 14 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6, marginBottom: 7 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  description: { fontSize: 14, lineHeight: 21, marginTop: 10 },
  menuList: { gap: 12, marginTop: 26 },
  menuRow: { minHeight: 76, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 12 },
  iconBox: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, marginLeft: 13, marginRight: 8 },
  itemTitle: { fontSize: 15, fontWeight: "800" },
  itemDescription: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: "700" },
  disabled: { opacity: 0.72 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
});