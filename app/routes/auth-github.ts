import { redirect } from "react-router";
import type { Route } from "./+types/auth-github";
import { getEnv } from "~/lib/context.server";
import { pkceChallenge, randomToken, sha256 } from "~/lib/crypto.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const state = randomToken(32);
  const verifier = randomToken(48);
  const now = new Date();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(now.toISOString()),
    env.DB.prepare(
      "INSERT INTO oauth_states (state_hash, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(
      await sha256(state),
      verifier,
      now.toISOString(),
      new Date(now.getTime() + 10 * 60_000).toISOString(),
    ),
  ]);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${env.APP_BASE_URL}/auth/github/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("allow_signup", "false");
  const secure = new URL(request.url).protocol === "https:";
  const cookieName = secure ? "__Host-oauth_state" : "oauth_state";
  const cookie = [
    `${cookieName}=${encodeURIComponent(state)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=600",
  ].filter(Boolean).join("; ");
  return redirect(url.toString(), { headers: { "Set-Cookie": cookie } });
}
