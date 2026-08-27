import { AppIcon } from "@/components/ui/app-icon";
import type { StyleProp, TextInputProps, TextStyle } from "react-native";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useState } from "react";

export type PasswordInputColors = {
  foreground: string;
  muted: string;
  surface: string;
  border: string;
};

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry" | "style" | "value" | "onChangeText"> & {
  value: string;
  onChangeText: (value: string) => void;
  colors: PasswordInputColors;
  inputStyle?: StyleProp<TextStyle>;
};

export function PasswordInput({ value, onChangeText, colors, inputStyle, ...props }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const actionLabel = isVisible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi";

  return (
    <View style={styles.container}>
      <TextInput
        {...props}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!isVisible}
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
          inputStyle,
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        accessibilityHint="Ketuk untuk mengubah tampilan kata sandi"
        accessibilityState={{ selected: isVisible }}
        hitSlop={8}
        onPress={() => setIsVisible((current) => !current)}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <AppIcon name={isVisible ? "eye-off" : "eye"} size={21} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "relative", width: "100%" },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, paddingRight: 52, fontSize: 15 },
  toggle: { position: "absolute", right: 8, top: 4, width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.6 },
});
