import type { Route } from "./+types/api-comment";
import { getEnv } from "~/lib/context.server";
import { deleteIssueComment } from "~/lib/github.server";
import { requireSameOrigin, requireSession } from "~/lib/session.server";
import { deleteStoredComment } from "~/lib/sync.server";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = getEnv(context);
  requireSameOrigin(request);
  const session = await requireSession(request, env);
  const commentId = Number(params.commentId);
  if (!Number.isInteger(commentId)) return Response.json({ error: "Invalid comment" }, { status: 400 });
  const row = await env.DB.prepare("SELECT is_admin FROM comments WHERE comment_id = ?")
    .bind(commentId)
    .first<{ is_admin: number }>();
  if (!row) return Response.json({ error: "Comment not found" }, { status: 404 });
  if (row.is_admin) return Response.json({ error: "Admin replies are protected" }, { status: 403 });
  try {
    await deleteIssueComment(env, commentId, session.accessToken);
    await deleteStoredComment(env, commentId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 502 },
    );
  }
}
