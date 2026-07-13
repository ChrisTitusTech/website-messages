import { redirect } from "react-router";
import type { Route } from "./+types/auth-callback";
import { getEnv } from "~/lib/context.server";
import { sha256 } from "~/lib/crypto.server";
import { exchangeOAuthCode, getGitHubUser } from "~/lib/github.server";
import { createSession } from "~/lib/session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const secure = url.protocol === "https:";
  const cookieName = secure ? "__Host-oauth_state" : "oauth_state";
  const cookieState = (request.headers.get("Cookie") || "")
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === cookieName)?.slice(1).join("=");
  const clearOAuthCookie = `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; ${secure ? "Secure; " : ""}Max-Age=0`;
  const fail = (message: string) => redirect(`/login?error=${encodeURIComponent(message)}`, {
    headers: { "Set-Cookie": clearOAuthCookie },
  });
  if (!code || !state || !cookieState || decodeURIComponent(cookieState) !== state) {
    return fail("GitHub did not return a valid authorization");
  }
  const stateHash = await sha256(state);
  const saved = await env.DB.prepare(
    "SELECT code_verifier, expires_at FROM oauth_states WHERE state_hash = ?",
  ).bind(stateHash).first<{ code_verifier: string; expires_at: string }>();
  await env.DB.prepare("DELETE FROM oauth_states WHERE state_hash = ?").bind(stateHash).run();
  if (!saved || new Date(saved.expires_at).getTime() < Date.now()) {
    return fail("The authorization request expired");
  }
  try {
    const tokens = await exchangeOAuthCode(env, code, saved.code_verifier);
    const user = await getGitHubUser(tokens.access_token);
    if (user.login.toLowerCase() !== env.ADMIN_LOGIN.toLowerCase()) {
      return fail("This GitHub account is not authorized");
    }
    const cookie = await createSession(
      env,
      request,
      { login: user.login, avatarUrl: user.avatar_url },
      tokens,
    );
    const headers = new Headers();
    headers.append("Set-Cookie", cookie);
    headers.append("Set-Cookie", clearOAuthCookie);
    return redirect("/", { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub sign-in failed";
    return fail(message);
  }
}
