import {
  fetchIssueComment,
  fetchIssues,
  fetchRepositoryComments,
} from "./github.server";
import {
  isUtteranceIssue,
  issueNumberFromUrl,
  recomputeThread,
  runStatements,
  upsertCommentStatement,
  upsertThreadStatement,
} from "./db.server";
import type { AppEnv, GitHubComment, GitHubIssue, SyncResult } from "./types";

export async function syncAll(env: AppEnv): Promise<SyncResult> {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  try {
    const [allIssues, allComments] = await Promise.all([fetchIssues(env), fetchRepositoryComments(env)]);
    const issues = allIssues.filter(isUtteranceIssue);
    const issueNumbers = new Set(issues.map((issue) => issue.number));
    const comments = allComments.flatMap((comment) => {
      const issueNumber = issueNumberFromUrl(comment.issue_url);
      return issueNumber && issueNumbers.has(issueNumber) ? [{ comment, issueNumber }] : [];
    });

    await runStatements(env, issues.map((issue) => upsertThreadStatement(env, issue, runId)));
    await runStatements(
      env,
      comments.map(({ comment, issueNumber }) => upsertCommentStatement(env, comment, issueNumber, runId)),
    );
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM comments WHERE (sync_run_id IS NULL OR sync_run_id != ?) AND synced_at <= ?",
      ).bind(runId, startedAt),
      env.DB.prepare(
        "DELETE FROM threads WHERE (sync_run_id IS NULL OR sync_run_id != ?) AND synced_at <= ?",
      ).bind(runId, startedAt),
      env.DB.prepare(
        `UPDATE threads SET
          comment_count = (SELECT COUNT(*) FROM comments WHERE comments.issue_number = threads.issue_number),
          latest_comment_id = (SELECT MAX(comment_id) FROM comments WHERE comments.issue_number = threads.issue_number),
          latest_activity_at = COALESCE(
            (SELECT MAX(updated_at) FROM comments WHERE comments.issue_number = threads.issue_number),
            latest_activity_at
          )`,
      ),
    ]);
    const completedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO sync_state (key, value, updated_at) VALUES ('last_sync', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).bind(completedAt, completedAt),
      env.DB.prepare("DELETE FROM sync_state WHERE key = 'last_error'"),
    ]);
    return { runId, threads: issues.length, comments: comments.length, completedAt };
  } catch (error) {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown synchronization error";
    await env.DB.prepare(
      `INSERT INTO sync_state (key, value, updated_at) VALUES ('last_error', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(message.slice(0, 1000), now).run();
    throw error;
  }
}

export async function upsertWebhookIssue(env: AppEnv, issue: GitHubIssue): Promise<boolean> {
  if (!isUtteranceIssue(issue)) return false;
  await upsertThreadStatement(env, issue, `webhook:${crypto.randomUUID()}`).run();
  return true;
}

export async function upsertWebhookComment(
  env: AppEnv,
  issue: GitHubIssue,
  commentId: number,
): Promise<boolean> {
  if (!(await upsertWebhookIssue(env, issue))) return false;
  const comment = await fetchIssueComment(env, commentId);
  await upsertCommentStatement(env, comment, issue.number, `webhook:${crypto.randomUUID()}`).run();
  await recomputeThread(env, issue.number);
  return true;
}

export async function storeCreatedComment(
  env: AppEnv,
  issueNumber: number,
  comment: GitHubComment,
): Promise<void> {
  await upsertCommentStatement(env, comment, issueNumber, `mutation:${crypto.randomUUID()}`).run();
  await recomputeThread(env, issueNumber);
}

export async function deleteStoredComment(env: AppEnv, commentId: number): Promise<number | null> {
  const row = await env.DB.prepare("SELECT issue_number FROM comments WHERE comment_id = ?")
    .bind(commentId)
    .first<{ issue_number: number }>();
  if (!row) return null;
  await env.DB.prepare("DELETE FROM comments WHERE comment_id = ?").bind(commentId).run();
  await recomputeThread(env, row.issue_number);
  return row.issue_number;
}

export type WebhookPayload = {
  action?: string;
  issue?: GitHubIssue;
  comment?: GitHubComment;
};
