import type { Route } from "./+types/api-sync";
import { getEnv } from "~/lib/context.server";
import { requireSameOrigin, requireSession } from "~/lib/session.server";
import { syncAll } from "~/lib/sync.server";

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  requireSameOrigin(request);
  await requireSession(request, env);
  try {
    return Response.json({ ok: true, result: await syncAll(env) });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Synchronization failed" },
      { status: 502 },
    );
  }
}
