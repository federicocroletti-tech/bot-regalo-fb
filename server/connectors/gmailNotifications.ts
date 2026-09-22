import { Buffer } from "node:buffer";
import { z } from "zod";
import type { ServerConfig } from "../config.js";
import type { OAuthToken } from "../tokenStore.js";
import type { Fetcher, ImportedListing, SyncResult } from "./types.js";
import { ProviderError, providerErrorMessage } from "./providerError.js";

const gmailTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
});

const gmailMessageSchema = z.object({
  id: z.string().min(1),
  internalDate: z.string().optional(),
  snippet: z.string().optional(),
  payload: z
    .object({
      mimeType: z.string().optional(),
      headers: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .optional(),
      body: z.object({ data: z.string().optional() }).optional(),
      parts: z.array(z.any()).optional(),
    })
    .optional(),
});

function requiredGmailSetting(
  config: ServerConfig,
  setting: "clientId" | "clientSecret" | "redirectUri",
): string {
  const value = config.gmail[setting];
  if (!value)
    throw new ProviderError(`Configura ${setting} per collegare Gmail.`, 409);
  return value;
}

function expiresAt(expiresIn: number | undefined): string | undefined {
  return expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : undefined;
}

export function createGmailAuthorizationUrl(
  config: ServerConfig,
  state: string,
): string {
  const endpoint = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  endpoint.search = new URLSearchParams({
    access_type: "offline",
    client_id: requiredGmailSetting(config, "clientId"),
    prompt: "consent",
    redirect_uri: requiredGmailSetting(config, "redirectUri"),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    state,
  }).toString();
  return endpoint.toString();
}

export async function exchangeGmailAuthorizationCode(
  config: ServerConfig,
  code: string,
  fetcher: Fetcher = fetch,
): Promise<OAuthToken> {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredGmailSetting(config, "clientId"),
      client_secret: requiredGmailSetting(config, "clientSecret"),
      code,
      grant_type: "authorization_code",
      redirect_uri: requiredGmailSetting(config, "redirectUri"),
    }),
  });
  if (!response.ok) throw await providerErrorMessage(response, "Google");

  const token = gmailTokenSchema.safeParse(await response.json());
  if (!token.success)
    throw new ProviderError(
      "Google ha restituito una risposta token non valida.",
    );

  return {
    accessToken: token.data.access_token,
    expiresAt: expiresAt(token.data.expires_in),
    refreshToken: token.data.refresh_token,
  };
}

export async function refreshGmailToken(
  config: ServerConfig,
  token: OAuthToken,
  fetcher: Fetcher = fetch,
): Promise<OAuthToken> {
  if (!token.refreshToken)
    throw new ProviderError(
      "Il token Gmail non puo essere aggiornato. Ricollega Gmail.",
      401,
    );

  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredGmailSetting(config, "clientId"),
      client_secret: requiredGmailSetting(config, "clientSecret"),
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  });
  if (!response.ok) throw await providerErrorMessage(response, "Google");

  const refreshed = gmailTokenSchema.safeParse(await response.json());
  if (!refreshed.success)
    throw new ProviderError(
      "Google ha restituito una risposta token non valida.",
    );

  return {
    accessToken: refreshed.data.access_token,
    expiresAt: expiresAt(refreshed.data.expires_in),
    refreshToken: refreshed.data.refresh_token ?? token.refreshToken,
  };
}

function decodeBody(data: string | undefined): string {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

function collectMessageText(
  part: z.infer<typeof gmailMessageSchema>["payload"],
): string[] {
  if (!part) return [];
  const children = (part.parts ?? []).flatMap((child) =>
    collectMessageText(child),
  );
  const text = part.mimeType?.startsWith("text/")
    ? decodeBody(part.body?.data)
    : "";
  return text ? [text, ...children] : children;
}

function subjectFromHeaders(
  headers: Array<{ name: string; value: string }> | undefined,
): string | undefined {
  return headers?.find((header) => header.name.toLowerCase() === "subject")
    ?.value;
}

function isFacebookHost(host: string): boolean {
  return (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.watch" ||
    host.endsWith(".fb.watch")
  );
}

export function extractFacebookUrls(text: string): string[] {
  const candidates = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const urls = new Set<string>();

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.replace(/[),.;]+$/, ""));
      const redirectTarget =
        url.hostname.toLowerCase() === "l.facebook.com"
          ? url.searchParams.get("u")
          : undefined;
      const resolved = redirectTarget ? new URL(redirectTarget) : url;

      if (!isFacebookHost(resolved.hostname.toLowerCase())) continue;
      resolved.hash = "";
      ["ref", "mibextid", "rdid"].forEach((parameter) =>
        resolved.searchParams.delete(parameter),
      );
      urls.add(resolved.toString().replace(/\/$/, ""));
    } catch {
      continue;
    }
  }

  return [...urls];
}

function sourcePublishedAt(
  internalDate: string | undefined,
): string | undefined {
  const timestamp = Number(internalDate);
  if (!Number.isFinite(timestamp)) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function syncGmailNotifications(
  config: ServerConfig,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<SyncResult> {
  const searchEndpoint = new URL(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages",
  );
  searchEndpoint.search = new URLSearchParams({
    maxResults: "50",
    q: config.gmail.query,
  }).toString();
  const headers = { authorization: `Bearer ${accessToken}` };
  const searchResponse = await fetcher(searchEndpoint, { headers });
  if (!searchResponse.ok)
    throw await providerErrorMessage(searchResponse, "Gmail");

  const searchResult = z
    .object({
      messages: z.array(z.object({ id: z.string().min(1) })).optional(),
    })
    .safeParse(await searchResponse.json());
  if (!searchResult.success)
    throw new ProviderError(
      "Gmail ha restituito un elenco messaggi non valido.",
    );

  const listings: ImportedListing[] = [];
  const warnings: string[] = [];

  for (const messageRef of searchResult.data.messages ?? []) {
    const endpoint = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageRef.id)}`,
    );
    endpoint.searchParams.set("format", "full");
    const messageResponse = await fetcher(endpoint, { headers });
    if (!messageResponse.ok) {
      warnings.push(
        `Non e stato possibile leggere una notifica Facebook (${messageRef.id}).`,
      );
      continue;
    }

    const message = gmailMessageSchema.safeParse(await messageResponse.json());
    if (!message.success) {
      warnings.push(
        `Una notifica Gmail non ha un formato leggibile (${messageRef.id}).`,
      );
      continue;
    }

    const subject = subjectFromHeaders(message.data.payload?.headers);
    const text = [
      subject,
      message.data.snippet,
      ...collectMessageText(message.data.payload),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 20_000);
    const urls = extractFacebookUrls(text);

    if (!urls.length) {
      warnings.push(
        `La notifica Gmail ${message.data.id} non contiene un link Facebook utilizzabile.`,
      );
      continue;
    }

    for (const url of urls) {
      listings.push({
        externalId: `gmail:${message.data.id}:${url}`,
        sourceName: subject
          ? `Notifica Facebook: ${subject}`
          : "Notifica Facebook",
        sourceText: text,
        sourcePublishedAt: sourcePublishedAt(message.data.internalDate),
        url,
      });
    }
  }

  return { listings, warnings };
}
