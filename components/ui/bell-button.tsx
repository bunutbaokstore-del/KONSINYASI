import { AppIcon } from "@/components/ui/app-icon";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";

export function BellButton() {
  const colors = useColors();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Buka pesan masuk (notifikasi)"
      onPress={() => router.push("/notifications")}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: `${colors.primary}18`, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name="notifications" size={22} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});