import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as LegacyAuth from "@/lib/_core/auth";
import { supabase } from "@/lib/supabase";

/**
 * tRPC v11 client shared by the mobile app and web preview.
 * Supabase access tokens are preferred; the legacy token remains as a
 * compatibility fallback for older Manus OAuth sessions.
 */
export const trpc = createTRPCReact<AppRouter>();

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        transformer: superjson,
        async headers() {
          const { data } = await supabase.auth.getSession();
          if (data.session?.access_token) {
            return { Authorization: `Bearer ${data.session.access_token}` };
          }

          const legacyToken = await LegacyAuth.getSessionToken();
          return legacyToken ? { Authorization: `Bearer ${legacyToken}` } : {};
        },
        fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    ],
  });
}
