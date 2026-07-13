import type { Route } from "./+types/api-read";
import { getEnv } from "~/lib/context.server";
import { markThreadRead } from "~/lib/db.server";
import { requireSameOrigin, requireSession } from "~/lib/session.server";

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = getEnv(context);
  requireSameOrigin(request);
  await requireSession(request, env);
  const issueNumber = Number(params.issueNumber);
  if (!Number.isInteger(issueNumber)) return Response.json({ error: "Invalid issue" }, { status: 400 });
  await markThreadRead(env, issueNumber);
  return Response.json({ ok: true });
}
