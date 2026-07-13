import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { getEnv } from "~/lib/context.server";
import { destroySession, requireSameOrigin } from "~/lib/session.server";

export async function action({ request, context }: Route.ActionArgs) {
  requireSameOrigin(request);
  const cookie = await destroySession(request, getEnv(context));
  return redirect("/login", { headers: { "Set-Cookie": cookie } });
}
