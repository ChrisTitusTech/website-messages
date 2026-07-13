import { createRequestHandler, RouterContextProvider } from "react-router";
import { appContext } from "../app/lib/context.server";
import { syncAll } from "../app/lib/sync.server";
import type { AppEnv, AppLoadContext } from "../app/lib/types";

declare global {
  interface CloudflareEnvironment extends AppEnv {}
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const provider = new RouterContextProvider();
    provider.set(appContext, {
      cloudflare: { env, ctx },
    } satisfies AppLoadContext);
    const response = await requestHandler(request, provider);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(syncAll(env));
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
