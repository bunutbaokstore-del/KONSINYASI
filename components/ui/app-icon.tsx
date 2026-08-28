import Svg, { Circle, Path, Polyline, Rect } from "react-native-svg";

export type AppIconName =
  | "inventory"
  | "verified-user"
  | "logout"
  | "handshake"
  | "verified"
  | "person"
  | "lock"
  | "help"
  | "chevron-right"
  | "chevron-left"
  | "arrow-back"
  | "edit"
  | "delete"
  | "group"
  | "add"
  | "close"
  | "refresh"
  | "house"
  | "send"
  | "code"
  | "eye"
  | "eye-off"
  | "upload"
  | "notifications";

type AppIconProps = {
  name: AppIconName;
  size?: number;
  color: string;
  strokeWidth?: number;
};

export function AppIcon({ name, size = 24, color, strokeWidth = 2 }: AppIconProps) {
  const common = { fill: "none", stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (name) {
    case "inventory":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z" /><Path {...common} d="M4 7.5 12 11l8-3.5M12 11v9" /><Path {...common} d="M8.5 5.5 16 9" /></Svg>;
    case "verified-user":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M12 3.5 19 6v5.4c0 4.3-2.9 7.8-7 9.1-4.1-1.3-7-4.8-7-9.1V6z" /><Polyline {...common} points="8.5,12 10.8,14.3 15.7,9.6" /></Svg>;
    case "logout":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M14 4H5.5v16H14M11 12h9M16.5 8.5 20 12l-3.5 3.5" /></Svg>;
    case "handshake":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m4 9 3-3 4 2 2-1 7 4-2 3-3-1-2 2-3-2-2 1-4-3z" /><Path {...common} d="m8 14 2 2M11 13l2 2M14 12l2 1" /></Svg>;
    case "verified":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle {...common} cx="12" cy="12" r="8.5" /><Polyline {...common} points="8.5,12 10.8,14.3 15.7,9.6" /></Svg>;
    case "person":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle {...common} cx="12" cy="8" r="3.2" /><Path {...common} d="M5 20c.8-3.2 3.2-5 7-5s6.2 1.8 7 5" /></Svg>;
    case "lock":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Rect {...common} x="5" y="10" width="14" height="10" rx="2" /><Path {...common} d="M8 10V7.5a4 4 0 0 1 8 0V10" /></Svg>;
    case "help":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle {...common} cx="12" cy="12" r="8.5" /><Path {...common} d="M9.7 9.2a2.5 2.5 0 1 1 4 2c-1.3.8-1.7 1.2-1.7 2.3M12 16.5h.01" /></Svg>;
    case "chevron-right":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m9 5 7 7-7 7" /></Svg>;
    case "chevron-left":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m15 5-7 7 7 7" /></Svg>;
    case "edit":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2.3 2.3 0 0 0-3.3-3.3zM14.5 4.5l5 5" /></Svg>;
    case "delete":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></Svg>;
    case "group":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle {...common} cx="9" cy="8" r="3" /><Path {...common} d="M3.5 19c.6-3.1 2.4-4.7 5.5-4.7s4.9 1.6 5.5 4.7M16 6.5a2.7 2.7 0 0 1 0 5.2M16.2 14.5c2.5.5 3.8 2 4.3 4.5" /></Svg>;
    case "add":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M12 5v14M5 12h14" /></Svg>;
    case "close":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m6 6 12 12M18 6 6 18" /></Svg>;
    case "refresh":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M19 8.5A8 8 0 1 0 20 13" /><Path {...common} d="M19 4v4.5h-4.5" /></Svg>;
    case "arrow-back":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
    case "house":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m4 11 8-7 8 7v8.5H4z" /><Path {...common} d="M9 19.5v-5h6v5" /></Svg>;
    case "send":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m4 4 16 8-16 8 3-8zM7 12h13" /></Svg>;
    case "code":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></Svg>;
    case "eye":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M3.5 12s3.1-5 8.5-5 8.5 5 8.5 5-3.1 5-8.5 5-8.5-5-8.5-5z" /><Circle {...common} cx="12" cy="12" r="2.1" /></Svg>;
    case "eye-off":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="m4 4 16 16M10.6 6.9A9.3 9.3 0 0 1 12 7c5.4 0 8.5 5 8.5 5a16 16 0 0 1-3 3.2M6.3 6.8C4.4 8.1 3.5 10 3.5 10s3.1 5 8.5 5c.5 0 1-.1 1.5-.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Svg>;
    case "upload":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M12 16V4M7.5 8.5 12 4l4.5 4.5M5 14.5v4h14v-4" /></Svg>;
    case "notifications":
      return <Svg width={size} height={size} viewBox="0 0 24 24"><Path {...common} d="M6 10a6 6 0 0 1 12 0v4l2 2H4l2-2z" /><Path {...common} d="M10 19h4" /></Svg>;
  }
}
