import { config as loadEnvironment } from "dotenv";
import { z } from "zod";

loadEnvironment({ path: ".env.local" });

const environmentSchema = z.object({
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(8787),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
  SYNC_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .min(15)
    .max(24 * 60)
    .default(360),
  META_APP_ID: z.string().trim().min(1).optional(),
  META_APP_SECRET: z.string().trim().min(1).optional(),
  META_REDIRECT_URI: z.string().url().optional(),
  META_LOGIN_CONFIG_ID: z.string().trim().min(1).optional(),
  META_GRAPH_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default("v26.0"),
  META_PAGE_IDS: z.string().trim().optional(),
  GMAIL_CLIENT_ID: z.string().trim().min(1).optional(),
  GMAIL_CLIENT_SECRET: z.string().trim().min(1).optional(),
  GMAIL_REDIRECT_URI: z.string().url().optional(),
  GMAIL_QUERY: z
    .string()
    .trim()
    .min(1)
    .default("from:facebookmail.com newer_than:30d"),
  TOKEN_ENCRYPTION_KEY: z.string().trim().min(32).optional(),
});

export interface ServerConfig {
  port: number;
  appOrigin: string;
  syncIntervalMinutes: number;
  meta: {
    appId?: string;
    appSecret?: string;
    redirectUri?: string;
    loginConfigId?: string;
    graphApiVersion: string;
    pageIds: string[];
  };
  gmail: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    query: string;
  };
  tokenEncryptionKey?: string;
}

export interface ConnectorStatus {
  id: "meta-pages" | "gmail-notifications";
  configured: boolean;
  missing: string[];
}

function nonEmptyEnvironmentValue(
  value: string | undefined,
): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue || undefined;
}

export function readServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const values = environmentSchema.parse({
    API_PORT: environment.API_PORT,
    APP_ORIGIN: environment.APP_ORIGIN,
    SYNC_INTERVAL_MINUTES: environment.SYNC_INTERVAL_MINUTES,
    META_APP_ID: nonEmptyEnvironmentValue(environment.META_APP_ID),
    META_APP_SECRET: nonEmptyEnvironmentValue(environment.META_APP_SECRET),
    META_REDIRECT_URI: nonEmptyEnvironmentValue(environment.META_REDIRECT_URI),
    META_LOGIN_CONFIG_ID: nonEmptyEnvironmentValue(
      environment.META_LOGIN_CONFIG_ID,
    ),
    META_GRAPH_API_VERSION: nonEmptyEnvironmentValue(
      environment.META_GRAPH_API_VERSION,
    ),
    META_PAGE_IDS: nonEmptyEnvironmentValue(environment.META_PAGE_IDS),
    GMAIL_CLIENT_ID: nonEmptyEnvironmentValue(environment.GMAIL_CLIENT_ID),
    GMAIL_CLIENT_SECRET: nonEmptyEnvironmentValue(
      environment.GMAIL_CLIENT_SECRET,
    ),
    GMAIL_REDIRECT_URI: nonEmptyEnvironmentValue(
      environment.GMAIL_REDIRECT_URI,
    ),
    GMAIL_QUERY: nonEmptyEnvironmentValue(environment.GMAIL_QUERY),
    TOKEN_ENCRYPTION_KEY: nonEmptyEnvironmentValue(
      environment.TOKEN_ENCRYPTION_KEY,
    ),
  });

  return {
    port: values.API_PORT,
    appOrigin: values.APP_ORIGIN,
    syncIntervalMinutes: values.SYNC_INTERVAL_MINUTES,
    meta: {
      appId: values.META_APP_ID,
      appSecret: values.META_APP_SECRET,
      redirectUri: values.META_REDIRECT_URI,
      loginConfigId: values.META_LOGIN_CONFIG_ID,
      graphApiVersion: values.META_GRAPH_API_VERSION,
      pageIds:
        values.META_PAGE_IDS?.split(",")
          .map((id) => id.trim())
          .filter(Boolean) ?? [],
    },
    gmail: {
      clientId: values.GMAIL_CLIENT_ID,
      clientSecret: values.GMAIL_CLIENT_SECRET,
      redirectUri: values.GMAIL_REDIRECT_URI,
      query: values.GMAIL_QUERY,
    },
    tokenEncryptionKey: values.TOKEN_ENCRYPTION_KEY,
  };
}

function missingConfiguration(
  values: Record<string, string | undefined>,
): string[] {
  return Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

export function getConnectorStatuses(config: ServerConfig): ConnectorStatus[] {
  const statuses: ConnectorStatus[] = [
    {
      id: "meta-pages",
      missing: missingConfiguration({
        META_APP_ID: config.meta.appId,
        META_APP_SECRET: config.meta.appSecret,
        META_REDIRECT_URI: config.meta.redirectUri,
        META_PAGE_IDS: config.meta.pageIds.length ? "configured" : undefined,
        TOKEN_ENCRYPTION_KEY: config.tokenEncryptionKey,
      }),
      configured: false,
    },
    {
      id: "gmail-notifications",
      missing: missingConfiguration({
        GMAIL_CLIENT_ID: config.gmail.clientId,
        GMAIL_CLIENT_SECRET: config.gmail.clientSecret,
        GMAIL_REDIRECT_URI: config.gmail.redirectUri,
        TOKEN_ENCRYPTION_KEY: config.tokenEncryptionKey,
      }),
      configured: false,
    },
  ];

  return statuses.map((connector) => ({
    ...connector,
    configured: connector.missing.length === 0,
  }));
}
