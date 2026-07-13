export interface AppEnv {
  DB: D1Database;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  ADMIN_LOGIN: string;
  APP_BASE_URL: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_WEBHOOK_SECRET: string;
  SESSION_ENCRYPTION_KEY: string;
}

export interface AppLoadContext {
  cloudflare: {
    env: AppEnv;
    ctx: ExecutionContext;
  };
}

export interface SessionUser {
  login: string;
  avatarUrl: string | null;
}

export interface ThreadSummary {
  issue_number: number;
  title: string;
  article_url: string | null;
  github_url: string;
  state: "open" | "closed";
  locked: number;
  comment_count: number;
  latest_activity_at: string;
  latest_author: string | null;
  latest_avatar_url: string | null;
  latest_snippet: string | null;
  unread: number;
  needs_reply: number;
}

export interface StoredComment {
  comment_id: number;
  issue_number: number;
  author_login: string;
  author_avatar_url: string | null;
  github_url: string;
  body_markdown: string;
  body_html: string;
  created_at: string;
  updated_at: string;
  is_admin: number;
}

export interface SyncResult {
  runId: string;
  threads: number;
  comments: number;
  completedAt: string;
}

export type InboxFilter = "all" | "unread" | "needs-reply" | "replied";

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  locked: boolean;
  comments: number;
  created_at: string;
  updated_at: string;
  body: string | null;
  user: { login: string } | null;
  pull_request?: unknown;
}

export interface GitHubComment {
  id: number;
  html_url: string;
  issue_url: string;
  body: string | null;
  body_html?: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string | null } | null;
}
