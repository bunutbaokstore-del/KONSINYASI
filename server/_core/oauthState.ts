import { randomBytes } from "node:crypto";

export const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
export const OAUTH_STATE_BYTES = 32;
export const OAUTH_BINDING_BYTES = 24;

type OAuthStateRecord = {
  redirectUri: string;
  expiresAt: number;
  binding: string;
};

export function randomBindingId(): string {
  return randomBytes(OAUTH_BINDING_BYTES).toString("base64url");
}

export class OAuthStateStore {
  private readonly store = new Map<string, OAuthStateRecord>();

  constructor(private readonly ttlMs: number = OAUTH_STATE_TTL_MS) {}

  issue(
    redirectUri: string,
    binding: string,
  ): { state: string; expiresInMs: number } {
    this.prune();
    const state = randomBytes(OAUTH_STATE_BYTES).toString("base64url");
    this.store.set(state, {
      redirectUri,
      expiresAt: Date.now() + this.ttlMs,
      binding,
    });
    return { state, expiresInMs: this.ttlMs };
  }

  /**
   * Verify the binding for an issued state WITHOUT consuming it.
   * Binding must be validated before the state is consumed.
   */
  validateBinding(state: string, binding: string): boolean {
    const record = this.store.get(state);
    if (!record) return false;
    if (record.expiresAt <= Date.now()) {
      this.store.delete(state);
      return false;
    }
    return record.binding === binding;
  }

  consume(state: string): string | null {
    const record = this.store.get(state);
    if (!record) return null;
    this.store.delete(state);
    if (record.expiresAt <= Date.now()) return null;
    return record.redirectUri;
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  private prune(): void {
    const now = Date.now();
    for (const [state, record] of this.store) {
      if (record.expiresAt <= now) this.store.delete(state);
    }
  }
}

export const oauthStateStore = new OAuthStateStore();