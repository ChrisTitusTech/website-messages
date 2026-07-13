import { redirect, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { getEnv } from "~/lib/context.server";
import { getSession } from "~/lib/session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  if (await getSession(request, getEnv(context))) throw redirect("/");
  return null;
}

export default function Login() {
  const [params] = useSearchParams();
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-mark" aria-hidden="true">CT</div>
        <span className="eyebrow">Private moderation console</span>
        <h1>Website Messages</h1>
        <p>Read and answer Utterances conversations without living in the GitHub Issues tab.</p>
        {params.get("error") ? <div className="alert alert--error">{params.get("error")}</div> : null}
        <a className="button button--github" href="/auth/github">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.5v-2c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C15.6 4 16.7 4.3 16.7 4.3c.6 1.6.2 2.9.1 3.2.8.8 1.2 1.8 1.2 3.1 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v4c0 .3.2.6.8.5A11.5 11.5 0 0 0 12 .7Z" /></svg>
          Sign in with GitHub
        </a>
        <small>Access is restricted to ChrisTitusTech.</small>
      </section>
    </main>
  );
}
