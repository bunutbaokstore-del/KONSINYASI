import { ThemedView } from "@/components/themed-view";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { resolveOAuthCallback } from "@/lib/_core/oauth-callback";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    sessionToken?: string;
    user?: string;
  }>();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      console.log("[OAuth] Callback handler triggered");

      let error = params.error ?? null;
      let code: string | null = params.code ?? null;
      let state: string | null = params.state ?? null;

      let tokenFromUrl: string | null = params.sessionToken ?? null;
      let userFromUrl: string | null = params.user ?? null;

      if (!code || !state) {
        try {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            const parsed = new URL(initialUrl, "http://dummy");
            if (!code) code = parsed.searchParams.get("code");
            if (!state) state = parsed.searchParams.get("state");
            if (!error) error = parsed.searchParams.get("error");
            if (!tokenFromUrl) tokenFromUrl = parsed.searchParams.get("sessionToken");
            if (!userFromUrl) userFromUrl = parsed.searchParams.get("user");
          }
        } catch (e) {
          console.log("[OAuth] Failed to parse initial URL:", e);
        }
      }

      if (error) {
        console.error("[OAuth] Error parameter found:", error);
        setStatus("error");
        setErrorMessage(error);
        return;
      }

      console.log("[OAuth] Extracted values:", {
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
        hasTokenFromUrl: !!tokenFromUrl,
      });

      const outcome = await resolveOAuthCallback(
        { error, code, state, tokenFromUrl, userFromUrl },
        Api.exchangeOAuthCode,
      );

      if (outcome.status === "error") {
        console.error("[OAuth] Authentication rejected:", outcome.message);
        setStatus("error");
        setErrorMessage(outcome.message);
        return;
      }

      console.log("[OAuth] Session token received from trusted exchange");
      await Auth.setSessionToken(outcome.sessionToken);

      if (outcome.user) {
        const userData = outcome.user as Record<string, unknown>;
        const userInfo: Auth.User = {
          id: Number(userData.id) || 0,
          openId: String(userData.openId ?? ""),
          name: userData.name ? String(userData.name) : null,
          email: userData.email ? String(userData.email) : null,
          loginMethod: userData.loginMethod ? String(userData.loginMethod) : null,
          lastSignedIn: new Date(
            userData.lastSignedIn ? String(userData.lastSignedIn) : Date.now(),
          ),
        };
        await Auth.setUserInfo(userInfo);
        console.log("[OAuth] User info stored");
      }

      setStatus("success");
      console.log("[OAuth] Authentication successful, redirecting to home...");

      setTimeout(() => {
        console.log("[OAuth] Executing redirect...");
        router.replace("/(tabs)");
      }, 1000);
    };

    handleCallback();
  }, [params.code, params.state, params.error, params.sessionToken, params.user, router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">
              Completing authentication...
            </Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text className="text-base leading-6 text-center text-foreground">
              Authentication successful!
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              Redirecting...
            </Text>
          </>
        )}
        {status === "error" && (
          <>
            <Text className="mb-2 text-xl font-bold leading-7 text-error">
              Authentication failed
            </Text>
            <Text className="text-base leading-6 text-center text-foreground">
              {errorMessage}
            </Text>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}