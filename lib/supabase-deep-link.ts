export type AuthLinkTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
};

export function parseSupabaseAuthUrl(url: string): AuthLinkTokens {
  const parsed = new URL(url);
  const query = new URLSearchParams(parsed.search);
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const get = (key: string) => hash.get(key) ?? query.get(key);

  return {
    accessToken: get("access_token"),
    refreshToken: get("refresh_token"),
    type: get("type"),
  };
}

export function isPasswordRecoveryLink(tokens: AuthLinkTokens, mode?: string) {
  return mode === "reset" || tokens.type === "recovery";
}
