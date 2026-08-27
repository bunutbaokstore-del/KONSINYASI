import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { supabase } from "@/lib/supabase";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

function tokensFromUrl(url: string) {
  const hash = url.includes("#") ? url.split("#")[1] : "";
  const params = new URLSearchParams(hash);
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
  };
}

export default function SupabaseAuthCallbackScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [error, setError] = useState<string | null>(null);
  const linkingUrl = Linking.useLinkingURL();

  useEffect(() => {
    let mounted = true;

    const completeAuth = async () => {
      const url = linkingUrl ?? await Linking.getInitialURL();
      if (!url) {
        if (mounted) setError("Tautan autentikasi tidak ditemukan.");
        return;
      }

      const { accessToken, refreshToken } = tokensFromUrl(url);
      if (!accessToken || !refreshToken) {
        if (mounted) setError("Tautan autentikasi tidak valid atau sudah kedaluwarsa.");
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        if (mounted) setError("Sesi tidak dapat dibuat. Silakan minta tautan baru.");
        return;
      }

      if (mounted) {
        router.replace(params.mode === "reset" ? ("/reset-password" as never) : "/");
      }
    };

    completeAuth();
    return () => {
      mounted = false;
    };
  }, [linkingUrl, params.mode, router]);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="items-center justify-center px-6">
      {error ? (
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.foreground }]}>Tautan tidak dapat digunakan</Text>
          <Text style={[styles.message, { color: colors.muted }]}>{error}</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.message, { color: colors.muted }]}>Menyelesaikan autentikasi…</Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", maxWidth: 320 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800", textAlign: "center" },
  message: { fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10 },
});
