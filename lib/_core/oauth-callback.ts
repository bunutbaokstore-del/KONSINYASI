export type OAuthCallbackInput = {
  error?: string | null;
  code?: string | null;
  state?: string | null;
  tokenFromUrl?: string | null;
  userFromUrl?: string | null;
};

export type OAuthSessionExchange = (
  code: string,
  state: string,
) => Promise<{ sessionToken: string; user: unknown }>;

export type OAuthCallbackOutcome =
  | { status: "error"; message: string }
  | { status: "success"; sessionToken: string; user: unknown };

export async function resolveOAuthCallback(
  input: OAuthCallbackInput,
  exchange: OAuthSessionExchange,
): Promise<OAuthCallbackOutcome> {
  if (input.error) {
    return { status: "error", message: input.error };
  }

  if (!input.code || !input.state) {
    if (input.tokenFromUrl || input.userFromUrl) {
      console.warn(
        "[OAuth] Ignoring sessionToken/user received via URL: tokens from URLs are not trusted",
      );
    }
    return { status: "error", message: "Missing code or state parameter" };
  }

  let result: { sessionToken: string; user: unknown };
  try {
    result = await exchange(input.code, input.state);
  } catch (error) {
    console.error("[OAuth] Trusted exchange failed:", error);
    return { status: "error", message: "Failed to complete authentication" };
  }

  if (!result.sessionToken) {
    return { status: "error", message: "No session token received" };
  }

  return { status: "success", sessionToken: result.sessionToken, user: result.user };
}