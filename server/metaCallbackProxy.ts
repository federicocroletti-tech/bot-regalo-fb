import { createServer, type Server } from "node:http";

const callbackPath = "/api/auth/meta/callback";

export function createMetaCallbackRedirectUrl(
  requestUrl: string | undefined,
  apiPort: number,
): string | undefined {
  if (!requestUrl) return undefined;

  try {
    const incomingUrl = new URL(requestUrl, "http://callback.local");
    if (incomingUrl.pathname !== callbackPath) return undefined;

    const destination = new URL(callbackPath, `http://127.0.0.1:${apiPort}`);
    destination.search = incomingUrl.search;
    return destination.toString();
  } catch {
    return undefined;
  }
}

export function createMetaCallbackProxy(apiPort: number): Server {
  return createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET", "Cache-Control": "no-store" });
      response.end();
      return;
    }

    const redirectUrl = createMetaCallbackRedirectUrl(request.url, apiPort);
    if (!redirectUrl) {
      response.writeHead(404, { "Cache-Control": "no-store" });
      response.end();
      return;
    }

    response.writeHead(302, {
      "Cache-Control": "no-store",
      Location: redirectUrl,
    });
    response.end();
  });
}

export function startMetaCallbackProxy(port: number, apiPort: number): Server {
  const proxy = createMetaCallbackProxy(apiPort);
  proxy.listen(port, "127.0.0.1", () => {
    console.log(
      `Proxy callback Meta pronto su http://127.0.0.1:${port}${callbackPath}`,
    );
  });
  return proxy;
}
