import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

const MAPPING = {
  "house.fill": "house",
  "shippingbox.fill": "shippingbox",
  "building.2.fill": "building",
  "wallet.bifold.fill": "wallet",
  "person.fill": "person",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
} as const satisfies Record<string, AppIconName>;

type IconSymbolName = keyof typeof MAPPING;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: unknown;
}) {
  return <AppIcon name={MAPPING[name]} size={size} color={String(color)} />;
}
