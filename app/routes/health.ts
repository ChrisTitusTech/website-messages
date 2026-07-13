import type { Route } from "./+types/health";
import { getEnv } from "~/lib/context.server";

export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  try {
    await env.DB.prepare("SELECT 1").first();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unhealthy" }, { status: 503 });
  }
}
