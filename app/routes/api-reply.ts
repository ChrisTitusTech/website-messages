import type { Route } from "./+types/api-reply";
import { getEnv } from "~/lib/context.server";
import { createIssueComment } from "~/lib/github.server";
import { getThread, markThreadRead } from "~/lib/db.server";
import { requireSameOrigin, requireSession } from "~/lib/session.server";
import { storeCreatedComment } from "~/lib/sync.server";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = getEnv(context);
  requireSameOrigin(request);
  const session = await requireSession(request, env);
  const issueNumber = Number(params.issueNumber);
  if (!Number.isInteger(issueNumber) || !(await getThread(env, issueNumber))) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }
  const form = await request.formData();
  const body = String(form.get("body") || "").trim();
  if (!body) return Response.json({ error: "Write a reply first" }, { status: 400 });
  if (body.length > 65_536) return Response.json({ error: "Reply is too long" }, { status: 400 });
  try {
    const comment = await createIssueComment(env, issueNumber, body, session.accessToken);
    await storeCreatedComment(env, issueNumber, comment);
    await markThreadRead(env, issueNumber);
    return Response.json({ ok: true, commentId: comment.id });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Reply failed" },
      { status: 502 },
    );
  }
}
