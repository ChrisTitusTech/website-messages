import { base64Url, importGitHubPrivateKey } from "./crypto.server";
import type { AppEnv, GitHubComment, GitHubIssue } from "./types";

const API_VERSION = "2026-03-10";
let cachedInstallationToken: { token: string; expiresAt: number } | null = null;

async function appJwt(env: AppEnv): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID }));
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await importGitHubPrivateKey(env.GITHUB_APP_PRIVATE_KEY),
    new TextEncoder().encode(input),
  );
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

export async function installationToken(env: AppEnv): Promise<string> {
  if (cachedInstallationToken && cachedInstallationToken.expiresAt > Date.now() + 60_000) {
    return cachedInstallationToken.token;
  }
  const response = await fetch(
    `https://api.github.com/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: githubHeaders(await appJwt(env)),
    },
  );
  const data = await response.json<{ token?: string; expires_at?: string; message?: string }>();
  if (!response.ok || !data.token || !data.expires_at) {
    throw new Error(data.message || `GitHub installation authentication failed (${response.status})`);
  }
  cachedInstallationToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };
  return data.token;
}

function githubHeaders(token: string, accept = "application/vnd.github+json"): HeadersInit {
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "User-Agent": "ChrisTitusTech-website-messages",
    "X-GitHub-Api-Version": API_VERSION,
  };
}

export async function githubRequest<T>(
  env: AppEnv,
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      ...githubHeaders(token || (await installationToken(env)), "application/vnd.github.full+json"),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${response.status}: ${body.slice(0, 500)}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json<T>();
}

export async function fetchAllPages<T>(env: AppEnv, path: string): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const values = await githubRequest<T[]>(env, `${path}${separator}per_page=100&page=${page}`);
    results.push(...values);
    if (values.length < 100) break;
    if (page >= 50) throw new Error("GitHub pagination safety limit reached");
  }
  return results;
}

export async function exchangeOAuthCode(
  env: AppEnv,
  code: string,
  verifier: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${env.APP_BASE_URL}/auth/github/callback`,
      code_verifier: verifier,
    }),
  });
  const data = await response.json<Record<string, unknown>>();
  if (!response.ok || typeof data.access_token !== "string") {
    throw new Error(typeof data.error_description === "string" ? data.error_description : "OAuth exchange failed");
  }
  return data as Awaited<ReturnType<typeof exchangeOAuthCode>>;
}

export async function getGitHubUser(accessToken: string): Promise<{ login: string; avatar_url: string | null }> {
  const response = await fetch("https://api.github.com/user", { headers: githubHeaders(accessToken) });
  if (!response.ok) throw new Error("Unable to validate GitHub user");
  return response.json<{ login: string; avatar_url: string | null }>();
}

export async function refreshUserToken(env: AppEnv, refreshToken: string) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await response.json<Record<string, unknown>>();
  if (!response.ok || typeof data.access_token !== "string") throw new Error("GitHub session refresh failed");
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  };
}

export async function createIssueComment(
  env: AppEnv,
  issueNumber: number,
  body: string,
  userToken: string,
): Promise<GitHubComment> {
  return githubRequest<GitHubComment>(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}/comments`,
    { method: "POST", body: JSON.stringify({ body }) },
    userToken,
  );
}

export async function deleteIssueComment(
  env: AppEnv,
  commentId: number,
  userToken: string,
): Promise<void> {
  await githubRequest<void>(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/comments/${commentId}`,
    { method: "DELETE" },
    userToken,
  );
}

export async function fetchIssueComment(env: AppEnv, commentId: number): Promise<GitHubComment> {
  return githubRequest<GitHubComment>(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/comments/${commentId}`,
  );
}

export async function fetchIssues(env: AppEnv): Promise<GitHubIssue[]> {
  return fetchAllPages<GitHubIssue>(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues?state=all&sort=updated&direction=asc`,
  );
}

export async function fetchRepositoryComments(env: AppEnv): Promise<GitHubComment[]> {
  return fetchAllPages<GitHubComment>(
    env,
    `/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/comments?sort=created&direction=asc`,
  );
}
