import { randomBytes } from "node:crypto";

export type OAuthProvider = "meta" | "gmail";

interface StateRecord {
  provider: OAuthProvider;
  expiresAt: number;
}

export class OAuthStateStore {
  private readonly states = new Map<string, StateRecord>();

  constructor(
    private readonly timeToLiveMs = 10 * 60 * 1000,
    private readonly now = () => Date.now(),
  ) {}

  issue(provider: OAuthProvider): string {
    this.removeExpired();
    const state = randomBytes(32).toString("base64url");
    this.states.set(state, {
      provider,
      expiresAt: this.now() + this.timeToLiveMs,
    });
    return state;
  }

  consume(provider: OAuthProvider, state: string | undefined): boolean {
    this.removeExpired();
    if (!state) return false;

    const record = this.states.get(state);
    this.states.delete(state);
    return Boolean(record && record.provider === provider);
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [state, record] of this.states) {
      if (record.expiresAt <= now) this.states.delete(state);
    }
  }
}
