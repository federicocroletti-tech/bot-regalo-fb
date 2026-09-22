import { createHmac } from "node:crypto";
import { z } from "zod";
import type { ServerConfig } from "../config.js";
import type { OAuthToken } from "../tokenStore.js";
import type { Fetcher, SyncResult } from "./types.js";
import { ProviderError, providerErrorMessage } from "./providerError.js";

const accessTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
});

const pageFeedSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      message: z.string().optional(),
      permalink_url: z.string().url().optional(),
      created_time: z.string().optional(),
    }),
  ),
});

const pageAccountSchema = z.object({
  data: z.array(
    z.object({
      access_token: z.string().min(1),
      id: z.string().min(1),
      name: z.string().min(1).optional(),
    }),
  ),
});

function requiredMetaSetting(
  config: ServerConfig,
  setting: "appId" | "appSecret" | "redirectUri",
): string {
  const value = config.meta[setting];
  if (!value)
    throw new ProviderError(`Configura ${setting} per collegare Meta.`, 409);
  return value;
}

function graphEndpoint(config: ServerConfig, path: string): URL {
  return new URL(
    `https://graph.facebook.com/${config.meta.graphApiVersion}/${path}`,
  );
}

function appSecretProof(config: ServerConfig, accessToken: string): string {
  return createHmac("sha256", requiredMetaSetting(config, "appSecret"))
    .update(accessToken)
    .digest("hex");
}

export function createMetaAuthorizationUrl(
  config: ServerConfig,
  state: string,
): string {
  const endpoint = new URL(
    `https://www.facebook.com/${config.meta.graphApiVersion}/dialog/oauth`,
  );
  const parameters = new URLSearchParams({
    client_id: requiredMetaSetting(config, "appId"),
    redirect_uri: requiredMetaSetting(config, "redirectUri"),
    response_type: "code",
    state,
  });

  if (config.meta.loginConfigId) {
    parameters.set("config_id", config.meta.loginConfigId);
  } else {
    parameters.set("scope", "pages_show_list,pages_read_engagement");
  }

  endpoint.search = parameters.toString();
  return endpoint.toString();
}

export async function exchangeMetaAuthorizationCode(
  config: ServerConfig,
  code: string,
  fetcher: Fetcher = fetch,
): Promise<OAuthToken> {
  const endpoint = graphEndpoint(config, "oauth/access_token");
  endpoint.search = new URLSearchParams({
    client_id: requiredMetaSetting(config, "appId"),
    client_secret: requiredMetaSetting(config, "appSecret"),
    redirect_uri: requiredMetaSetting(config, "redirectUri"),
    code,
  }).toString();

  const response = await fetcher(endpoint);
  if (!response.ok) throw await providerErrorMessage(response, "Meta");

  const token = accessTokenSchema.safeParse(await response.json());
  if (!token.success)
    throw new ProviderError(
      "Meta ha restituito una risposta token non valida.",
    );

  return {
    accessToken: token.data.access_token,
    expiresAt: token.data.expires_in
      ? new Date(Date.now() + token.data.expires_in * 1000).toISOString()
      : undefined,
  };
}

export async function syncMetaPagePosts(
  config: ServerConfig,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<SyncResult> {
  if (!config.meta.pageIds.length) {
    throw new ProviderError(
      "Configura almeno un ID Pagina in META_PAGE_IDS.",
      409,
    );
  }

  const listings: SyncResult["listings"] = [];
  const warnings: string[] = [];
  const accountsEndpoint = graphEndpoint(config, "me/accounts");
  accountsEndpoint.search = new URLSearchParams({
    access_token: accessToken,
    appsecret_proof: appSecretProof(config, accessToken),
    fields: "id,name,access_token",
    limit: "100",
  }).toString();

  const accountsResponse = await fetcher(accountsEndpoint);
  if (!accountsResponse.ok)
    throw await providerErrorMessage(
      accountsResponse,
      "Meta durante la lettura delle Pagine autorizzate",
    );

  const accounts = pageAccountSchema.safeParse(await accountsResponse.json());
  if (!accounts.success)
    throw new ProviderError(
      "Meta ha restituito l'elenco Pagine in un formato non valido.",
    );
  const accountsById = new Map(
    accounts.data.data.map((account) => [account.id, account]),
  );

  for (const pageId of config.meta.pageIds) {
    const page = accountsById.get(pageId);
    if (!page) {
      warnings.push(
        `La Pagina ${pageId} non e stata autorizzata per questa app Meta.`,
      );
      continue;
    }

    const endpoint = graphEndpoint(
      config,
      `${encodeURIComponent(pageId)}/feed`,
    );
    endpoint.search = new URLSearchParams({
      access_token: page.access_token,
      appsecret_proof: appSecretProof(config, page.access_token),
      fields: "id,message,permalink_url,created_time",
      limit: "100",
    }).toString();

    const response = await fetcher(endpoint);
    if (!response.ok)
      throw await providerErrorMessage(
        response,
        `Meta per la Pagina ${pageId}`,
      );

    const result = pageFeedSchema.safeParse(await response.json());
    if (!result.success)
      throw new ProviderError(
        `Meta ha restituito un feed non valido per la Pagina ${pageId}.`,
      );

    for (const post of result.data.data) {
      if (!post.message?.trim()) {
        warnings.push(
          `Il post ${post.id} non contiene testo e non puo essere classificato.`,
        );
        continue;
      }

      listings.push({
        externalId: `meta:${post.id}`,
        sourceName: page.name ?? `Pagina Facebook ${pageId}`,
        sourceText: post.message,
        sourcePublishedAt: post.created_time,
        url: post.permalink_url ?? `https://www.facebook.com/${post.id}`,
      });
    }
  }

  return { listings, warnings };
}
