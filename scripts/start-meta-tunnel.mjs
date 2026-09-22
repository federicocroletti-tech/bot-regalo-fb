import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env.local" });

const callbackProxyPort = process.env.META_CALLBACK_PROXY_PORT ?? "8788";
const windowsBinary = resolve(".tools", "cloudflared", "cloudflared.exe");
const executable = process.platform === "win32" ? windowsBinary : "cloudflared";

if (process.platform === "win32" && !existsSync(executable)) {
  throw new Error(
    "cloudflared non trovato in .tools/cloudflared. Ripeti la configurazione del tunnel HTTPS.",
  );
}

const tunnel = spawn(
  executable,
  ["tunnel", "--url", `http://127.0.0.1:${callbackProxyPort}`],
  {
    stdio: "inherit",
  },
);

tunnel.on("error", (error) => {
  console.error("Impossibile avviare il tunnel HTTPS Meta:", error.message);
  process.exitCode = 1;
});

tunnel.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
