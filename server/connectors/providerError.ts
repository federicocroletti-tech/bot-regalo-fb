export class ProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export async function providerErrorMessage(
  response: Response,
  provider: string,
): Promise<ProviderError> {
  const defaultMessage = `${provider} ha rifiutato la richiesta.`;

  try {
    const body = (await response.json()) as {
      error?: { message?: string } | string;
    };
    const message =
      typeof body.error === "string" ? body.error : body.error?.message;
    return new ProviderError(message || defaultMessage, response.status);
  } catch {
    return new ProviderError(defaultMessage, response.status);
  }
}
