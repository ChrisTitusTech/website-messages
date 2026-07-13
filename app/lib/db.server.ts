import type {
  AppEnv,
  GitHubComment,
  GitHubIssue,
  InboxFilter,
  StoredComment,
  ThreadSummary,
} from "./types";

export function isUtteranceIssue(issue: GitHubIssue): boolean {
  return !issue.pull_request && issue.user?.login.toLowerCase() === "utterances-bot";
}

export function issueNumberFromUrl(issueUrl: string): number | null {
  const match = issueUrl.match(/\/issues\/(\d+)$/u);
  return match ? Number(match[1]) : null;
}

function articleUrl(issue: GitHubIssue): string | null {
  const match = issue.body?.match(/https:\/\/christitus\.com\/[^\s)\]]+/iu);
  return match?.[0] || null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br>");
}

export function upsertThreadStatement(env: AppEnv, issue: GitHubIssue, runId: string) {
  const now = new Date().toISOString();
  return env.DB.prepare(
    `INSERT INTO threads (
      issue_number, issue_id, title, article_url, github_url, state, locked,
      comment_count, latest_activity_at, sync_run_id, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(issue_number) DO UPDATE SET
      issue_id = excluded.issue_id,
      title = excluded.title,
      article_url = excluded.article_url,
      github_url = excluded.github_url,
      state = excluded.state,
      locked = excluded.locked,
      comment_count = excluded.comment_count,
      latest_activity_at = excluded.latest_activity_at,
      sync_run_id = excluded.sync_run_id,
      synced_at = excluded.synced_at`,
  ).bind(
    issue.number,
    issue.id,
    issue.title,
    articleUrl(issue),
    issue.html_url,
    issue.state,
    issue.locked ? 1 : 0,
    issue.comments,
    issue.updated_at,
    runId,
    now,
  );
}

export function upsertCommentStatement(
  env: AppEnv,
  comment: GitHubComment,
  issueNumber: number,
  runId: string,
) {
  const author = comment.user?.login || "ghost";
  return env.DB.prepare(
    `INSERT INTO comments (
      comment_id, issue_number, author_login, author_avatar_url, github_url,
      body_markdown, body_html, created_at, updated_at, is_admin, sync_run_id, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(comment_id) DO UPDATE SET
      issue_number = excluded.issue_number,
      author_login = excluded.author_login,
      author_avatar_url = excluded.author_avatar_url,
      github_url = excluded.github_url,
      body_markdown = excluded.body_markdown,
      body_html = excluded.body_html,
      updated_at = excluded.updated_at,
      is_admin = excluded.is_admin,
      sync_run_id = excluded.sync_run_id,
      synced_at = excluded.synced_at`,
  ).bind(
    comment.id,
    issueNumber,
    author,
    comment.user?.avatar_url || null,
    comment.html_url,
    comment.body || "",
    comment.body_html || `<p>${escapeHtml(comment.body || "")}</p>`,
    comment.created_at,
    comment.updated_at,
    author.toLowerCase() === env.ADMIN_LOGIN.toLowerCase() ? 1 : 0,
    runId,
    new Date().toISOString(),
  );
}

export async function runStatements(env: AppEnv, statements: D1PreparedStatement[], size = 75): Promise<void> {
  for (let index = 0; index < statements.length; index += size) {
    await env.DB.batch(statements.slice(index, index + size));
  }
}

export async function recomputeThread(env: AppEnv, issueNumber: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE threads SET
      comment_count = (SELECT COUNT(*) FROM comments WHERE issue_number = ?),
      latest_comment_id = (SELECT MAX(comment_id) FROM comments WHERE issue_number = ?),
      latest_activity_at = COALESCE(
        (SELECT MAX(updated_at) FROM comments WHERE issue_number = ?),
        latest_activity_at
      )
     WHERE issue_number = ?`,
  ).bind(issueNumber, issueNumber, issueNumber, issueNumber).run();
}

export async function markThreadRead(env: AppEnv, issueNumber: number): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT COALESCE(MAX(comment_id), 0) AS comment_id FROM comments WHERE issue_number = ? AND is_admin = 0",
  ).bind(issueNumber).first<{ comment_id: number }>();
  await env.DB.prepare(
    `INSERT INTO read_state (issue_number, last_read_visitor_comment_id, read_at)
     VALUES (?, ?, ?)
     ON CONFLICT(issue_number) DO UPDATE SET
       last_read_visitor_comment_id = excluded.last_read_visitor_comment_id,
       read_at = excluded.read_at`,
  ).bind(issueNumber, row?.comment_id || 0, new Date().toISOString()).run();
}

export async function listThreads(
  env: AppEnv,
  filter: InboxFilter,
  search: string,
  page: number,
): Promise<{ threads: ThreadSummary[]; total: number; unread: number }> {
  const conditions = [
    `(LOWER(t.title) LIKE ? OR LOWER(COALESCE(t.article_url, '')) LIKE ? OR EXISTS (
      SELECT 1 FROM comments sc WHERE sc.issue_number = t.issue_number
      AND (LOWER(sc.author_login) LIKE ? OR LOWER(sc.body_markdown) LIKE ?)
    ))`,
  ];
  if (filter === "unread") {
    conditions.push("EXISTS (SELECT 1 FROM comments uc WHERE uc.issue_number = t.issue_number AND uc.is_admin = 0 AND uc.comment_id > COALESCE(rs.last_read_visitor_comment_id, 0))");
  } else if (filter === "needs-reply") {
    conditions.push("COALESCE((SELECT lc.is_admin FROM comments lc WHERE lc.issue_number = t.issue_number ORDER BY lc.comment_id DESC LIMIT 1), 0) = 0");
  } else if (filter === "replied") {
    conditions.push("COALESCE((SELECT lc.is_admin FROM comments lc WHERE lc.issue_number = t.issue_number ORDER BY lc.comment_id DESC LIMIT 1), 0) = 1");
  }
  const needle = `%${search.toLowerCase()}%`;
  const where = conditions.join(" AND ");
  const totalRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM threads t LEFT JOIN read_state rs ON rs.issue_number = t.issue_number WHERE ${where}`,
  ).bind(needle, needle, needle, needle).first<{ count: number }>();
  const unreadRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM threads t LEFT JOIN read_state rs ON rs.issue_number = t.issue_number
     WHERE EXISTS (SELECT 1 FROM comments c WHERE c.issue_number = t.issue_number AND c.is_admin = 0
       AND c.comment_id > COALESCE(rs.last_read_visitor_comment_id, 0))`,
  ).first<{ count: number }>();
  const result = await env.DB.prepare(
    `SELECT t.issue_number, t.title, t.article_url, t.github_url, t.state, t.locked,
      t.comment_count, t.latest_activity_at,
      (SELECT c.author_login FROM comments c WHERE c.issue_number = t.issue_number ORDER BY c.comment_id DESC LIMIT 1) AS latest_author,
      (SELECT c.author_avatar_url FROM comments c WHERE c.issue_number = t.issue_number ORDER BY c.comment_id DESC LIMIT 1) AS latest_avatar_url,
      (SELECT SUBSTR(REPLACE(c.body_markdown, CHAR(10), ' '), 1, 160) FROM comments c WHERE c.issue_number = t.issue_number ORDER BY c.comment_id DESC LIMIT 1) AS latest_snippet,
      EXISTS (SELECT 1 FROM comments c WHERE c.issue_number = t.issue_number AND c.is_admin = 0
        AND c.comment_id > COALESCE(rs.last_read_visitor_comment_id, 0)) AS unread,
      (COALESCE((SELECT c.is_admin FROM comments c WHERE c.issue_number = t.issue_number ORDER BY c.comment_id DESC LIMIT 1), 0) = 0) AS needs_reply
     FROM threads t LEFT JOIN read_state rs ON rs.issue_number = t.issue_number
     WHERE ${where}
     ORDER BY t.latest_activity_at DESC LIMIT 50 OFFSET ?`,
  ).bind(needle, needle, needle, needle, (page - 1) * 50).all<ThreadSummary>();
  return { threads: result.results, total: totalRow?.count || 0, unread: unreadRow?.count || 0 };
}

export async function getThread(env: AppEnv, issueNumber: number) {
  const thread = await env.DB.prepare("SELECT * FROM threads WHERE issue_number = ?")
    .bind(issueNumber)
    .first<ThreadSummary>();
  if (!thread) return null;
  const comments = await env.DB.prepare(
    "SELECT * FROM comments WHERE issue_number = ? ORDER BY comment_id ASC",
  ).bind(issueNumber).all<StoredComment>();
  return { thread, comments: comments.results };
}

export async function getSyncStatus(env: AppEnv): Promise<{ lastSync: string | null; lastError: string | null }> {
  const rows = await env.DB.prepare("SELECT key, value FROM sync_state WHERE key IN ('last_sync', 'last_error')")
    .all<{ key: string; value: string }>();
  const values = new Map(rows.results.map((row) => [row.key, row.value]));
  return { lastSync: values.get("last_sync") || null, lastError: values.get("last_error") || null };
}
