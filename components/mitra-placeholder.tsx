import { ScreenContainer } from "@/components/screen-container";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { StyleSheet, Text, View } from "react-native";

type MitraPlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: AppIconName;
};

export function MitraPlaceholder({ eyebrow, title, description, icon }: MitraPlaceholderProps) {
  const colors = useColors();

  return (
    <ScreenContainer className="px-6">
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.iconBox, { backgroundColor: `${colors.primary}18` }]}>
            <AppIcon name={icon} size={28} color={colors.primary} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Segera hadir</Text>
          <Text style={[styles.description, { color: colors.muted }]}>{description}</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingTop: 14 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.6, marginBottom: 7 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "800", letterSpacing: -0.6 },
  card: { alignItems: "center", borderWidth: 1, borderRadius: 22, padding: 24, marginTop: 28 },
  iconBox: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: "800" },
  description: { fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 8 },
});
