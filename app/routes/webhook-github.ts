import type { Route } from "./+types/webhook-github";
import { getEnv } from "~/lib/context.server";
import { verifyWebhookSignature } from "~/lib/crypto.server";
import {
  deleteStoredComment,
  type WebhookPayload,
  upsertWebhookComment,
  upsertWebhookIssue,
} from "~/lib/sync.server";

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const body = await request.text();
  if (!(await verifyWebhookSignature(body, request.headers.get("X-Hub-Signature-256"), env.GITHUB_WEBHOOK_SECRET))) {
    return new Response("Invalid signature", { status: 401 });
  }
  const delivery = request.headers.get("X-GitHub-Delivery");
  const event = request.headers.get("X-GitHub-Event") || "unknown";
  if (!delivery) return new Response("Missing delivery ID", { status: 400 });
  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO webhook_deliveries (delivery_id, event_name, received_at) VALUES (?, ?, ?)",
  ).bind(delivery, event, new Date().toISOString()).run();
  if (inserted.meta.changes === 0) return Response.json({ ok: true, duplicate: true });

  const payload = JSON.parse(body) as WebhookPayload;
  if (event === "ping") return Response.json({ ok: true });
  if (event === "issue_comment" && payload.issue && payload.comment) {
    if (payload.action === "deleted") {
      await deleteStoredComment(env, payload.comment.id);
    } else if (payload.action === "created" || payload.action === "edited") {
      await upsertWebhookComment(env, payload.issue, payload.comment.id);
    }
  } else if (event === "issues" && payload.issue) {
    await upsertWebhookIssue(env, payload.issue);
  }
  return Response.json({ ok: true });
}
