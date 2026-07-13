import { redirect } from "react-router";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto.server";
import { refreshUserToken } from "./github.server";
import type { AppEnv, SessionUser } from "./types";

interface SessionRow {
  session_id_hash: string;
  github_login: string;
  github_avatar_url: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
}

export interface AuthenticatedSession {
  user: SessionUser;
  accessToken: string;
  sessionHash: string;
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function sessionCookie(value: string, secure: boolean, maxAge = 60 * 60 * 24 * 30): string {
  return [
    `${secure ? "__Host-session" : "session"}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ].filter(Boolean).join("; ");
}

export async function createSession(
  env: AppEnv,
  request: Request,
  user: SessionUser,
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  },
): Promise<string> {
  const id = randomToken(32);
  const hash = await sha256(id);
  const now = new Date();
  const accessExpiry = tokens.expires_in ? new Date(now.getTime() + tokens.expires_in * 1000).toISOString() : null;
  const refreshExpiry = tokens.refresh_token_expires_in
    ? new Date(now.getTime() + tokens.refresh_token_expires_in * 1000).toISOString()
    : null;
  await env.DB.prepare(
    `INSERT INTO sessions (
      session_id_hash, github_login, github_avatar_url, access_token_encrypted,
      refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at,
      created_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    hash,
    user.login,
    user.avatarUrl,
    await encrypt(tokens.access_token, env.SESSION_ENCRYPTION_KEY),
    tokens.refresh_token ? await encrypt(tokens.refresh_token, env.SESSION_ENCRYPTION_KEY) : null,
    accessExpiry,
    refreshExpiry,
    now.toISOString(),
    now.toISOString(),
  ).run();
  return sessionCookie(id, new URL(request.url).protocol === "https:");
}

export async function getSession(request: Request, env: AppEnv): Promise<AuthenticatedSession | null> {
  const id = cookieValue(request, "__Host-session") || cookieValue(request, "session");
  if (!id) return null;
  const hash = await sha256(id);
  const row = await env.DB.prepare("SELECT * FROM sessions WHERE session_id_hash = ?")
    .bind(hash)
    .first<SessionRow>();
  if (!row || row.github_login.toLowerCase() !== env.ADMIN_LOGIN.toLowerCase()) return null;

  let accessToken = await decrypt(row.access_token_encrypted, env.SESSION_ENCRYPTION_KEY);
  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : null;
  if (expiresAt && expiresAt < Date.now() + 5 * 60_000) {
    if (!row.refresh_token_encrypted) return null;
    const refreshToken = await decrypt(row.refresh_token_encrypted, env.SESSION_ENCRYPTION_KEY);
    const tokens = await refreshUserToken(env, refreshToken);
    accessToken = tokens.access_token;
    const now = new Date();
    await env.DB.prepare(
      `UPDATE sessions SET access_token_encrypted = ?, refresh_token_encrypted = ?,
       access_token_expires_at = ?, refresh_token_expires_at = ?, last_seen_at = ?
       WHERE session_id_hash = ?`,
    ).bind(
      await encrypt(tokens.access_token, env.SESSION_ENCRYPTION_KEY),
      await encrypt(tokens.refresh_token || refreshToken, env.SESSION_ENCRYPTION_KEY),
      tokens.expires_in ? new Date(now.getTime() + tokens.expires_in * 1000).toISOString() : null,
      tokens.refresh_token_expires_in
        ? new Date(now.getTime() + tokens.refresh_token_expires_in * 1000).toISOString()
        : row.refresh_token_expires_at,
      now.toISOString(),
      hash,
    ).run();
  } else {
    await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE session_id_hash = ?")
      .bind(new Date().toISOString(), hash)
      .run();
  }
  return {
    user: { login: row.github_login, avatarUrl: row.github_avatar_url },
    accessToken,
    sessionHash: hash,
  };
}

export async function requireSession(request: Request, env: AppEnv): Promise<AuthenticatedSession> {
  const session = await getSession(request, env);
  if (!session) throw redirect("/login");
  return session;
}

export async function destroySession(request: Request, env: AppEnv): Promise<string> {
  const id = cookieValue(request, "__Host-session") || cookieValue(request, "session");
  if (id) await env.DB.prepare("DELETE FROM sessions WHERE session_id_hash = ?").bind(await sha256(id)).run();
  return sessionCookie("", new URL(request.url).protocol === "https:", 0);
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new Response("Invalid request origin", { status: 403 });
  }
}
