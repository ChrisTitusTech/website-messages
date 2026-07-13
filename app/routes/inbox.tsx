import { useEffect, useMemo, useRef, useState } from "react";
import {
  Form,
  Link,
  redirect,
  useFetcher,
  useRevalidator,
  useSearchParams,
} from "react-router";
import type { Route } from "./+types/inbox";
import { getEnv } from "~/lib/context.server";
import { getSyncStatus, getThread, listThreads, markThreadRead } from "~/lib/db.server";
import { buildQuotedReply, relativeTime } from "~/lib/format";
import { requireSession } from "~/lib/session.server";
import type { InboxFilter, StoredComment, ThreadSummary } from "~/lib/types";

const FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "needs-reply", label: "Needs reply" },
  { value: "replied", label: "Replied" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const session = await requireSession(request, env);
  const url = new URL(request.url);
  const requestedFilter = url.searchParams.get("filter") || "all";
  const filter = FILTERS.some(({ value }) => value === requestedFilter)
    ? requestedFilter as InboxFilter
    : "all";
  const search = (url.searchParams.get("q") || "").trim().slice(0, 200);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const selectedNumber = Number(url.searchParams.get("thread"));
  if (Number.isInteger(selectedNumber) && selectedNumber > 0) {
    await markThreadRead(env, selectedNumber);
  }
  const [inbox, selected, syncStatus] = await Promise.all([
    listThreads(env, filter, search, page),
    Number.isInteger(selectedNumber) && selectedNumber > 0 ? getThread(env, selectedNumber) : null,
    getSyncStatus(env),
  ]);
  if (selectedNumber && !selected) throw redirect(`/?filter=${filter}&q=${encodeURIComponent(search)}`);
  return {
    ...inbox,
    selected,
    syncStatus,
    user: session.user,
    filter,
    search,
    page,
    pageCount: Math.max(1, Math.ceil(inbox.total / 50)),
  };
}

export default function Inbox({ loaderData }: Route.ComponentProps) {
  const revalidator = useRevalidator();
  const [params] = useSearchParams();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") revalidator.revalidate();
    };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [revalidator]);

  const threadHref = (issueNumber: number) => {
    const next = new URLSearchParams(params);
    next.set("thread", String(issueNumber));
    return `/?${next}`;
  };

  return (
    <main className={`app-shell ${loaderData.selected ? "app-shell--thread-open" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">CT</span>
          <div><strong>Website Messages</strong><span>Utterances inbox</span></div>
        </div>
        <div className="topbar__actions">
          <SyncButton status={loaderData.syncStatus} />
          <div className="profile">
            {loaderData.user.avatarUrl ? <img src={loaderData.user.avatarUrl} alt="" /> : null}
            <span>{loaderData.user.login}</span>
          </div>
          <Form method="post" action="/logout">
            <button className="icon-button" type="submit" title="Sign out" aria-label="Sign out">
              <Icon name="logout" />
            </button>
          </Form>
        </div>
      </header>

      <section className="inbox-pane" aria-label="Conversations">
        <div className="inbox-tools">
          <div className="inbox-heading">
            <div><h1>Inbox</h1><p>{loaderData.total} conversation{loaderData.total === 1 ? "" : "s"}</p></div>
            {loaderData.unread > 0 ? <span className="count-badge">{loaderData.unread} unread</span> : null}
          </div>
          <Form method="get" className="search-form">
            <input type="hidden" name="filter" value={loaderData.filter} />
            <Icon name="search" />
            <input name="q" type="search" defaultValue={loaderData.search} placeholder="Search messages or people" aria-label="Search messages" />
          </Form>
          <nav className="filters" aria-label="Conversation filters">
            {FILTERS.map(({ value, label }) => {
              const next = new URLSearchParams();
              next.set("filter", value);
              if (loaderData.search) next.set("q", loaderData.search);
              return <Link key={value} className={loaderData.filter === value ? "active" : ""} to={`/?${next}`}>{label}</Link>;
            })}
          </nav>
        </div>

        <div className="thread-list">
          {loaderData.threads.length ? loaderData.threads.map((thread) => (
            <Link
              key={thread.issue_number}
              className={`thread-row ${thread.unread ? "thread-row--unread" : ""} ${loaderData.selected?.thread.issue_number === thread.issue_number ? "thread-row--active" : ""}`}
              to={threadHref(thread.issue_number)}
            >
              <div className="thread-row__avatar">
                {thread.latest_avatar_url ? <img src={thread.latest_avatar_url} alt="" /> : <span>{thread.latest_author?.slice(0, 1).toUpperCase() || "?"}</span>}
                {thread.unread ? <i aria-label="Unread" /> : null}
              </div>
              <div className="thread-row__content">
                <div className="thread-row__title"><strong>{cleanTitle(thread.title)}</strong><time>{relativeTime(thread.latest_activity_at)}</time></div>
                <div className="thread-row__meta"><span>{thread.latest_author || "No comments"}</span>{thread.needs_reply ? <b>Needs reply</b> : <b className="replied">Replied</b>}</div>
                <p>{thread.latest_snippet || "No messages in this conversation yet."}</p>
              </div>
            </Link>
          )) : (
            <div className="empty-list"><Icon name="inbox" /><h2>No conversations found</h2><p>Try another filter or run a GitHub sync.</p></div>
          )}
        </div>
        {loaderData.pageCount > 1 ? (
          <nav className="pagination" aria-label="Inbox pages">
            <PageLink page={loaderData.page - 1} disabled={loaderData.page <= 1} params={params}>Previous</PageLink>
            <span>{loaderData.page} / {loaderData.pageCount}</span>
            <PageLink page={loaderData.page + 1} disabled={loaderData.page >= loaderData.pageCount} params={params}>Next</PageLink>
          </nav>
        ) : null}
      </section>

      <section className="conversation-pane" aria-label="Selected conversation">
        {loaderData.selected ? <Conversation detail={loaderData.selected} /> : <NoSelection hasThreads={loaderData.total > 0} />}
      </section>
    </main>
  );
}

function SyncButton({ status }: { status: { lastSync: string | null; lastError: string | null } }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);
  const title = status.lastError
    ? `Last sync failed: ${status.lastError}`
    : status.lastSync
      ? `Last synced ${relativeTime(status.lastSync)}`
      : "Not synced yet";
  return (
    <fetcher.Form method="post" action="/api/sync">
      <button className={`sync-button ${status.lastError ? "sync-button--error" : ""}`} type="submit" disabled={fetcher.state !== "idle"} title={title}>
        <Icon name="refresh" spin={fetcher.state !== "idle"} />
        <span>{fetcher.state !== "idle" ? "Syncing" : status.lastError ? "Sync failed" : "Sync"}</span>
      </button>
    </fetcher.Form>
  );
}

function Conversation({ detail }: { detail: { thread: ThreadSummary; comments: StoredComment[] } }) {
  const { thread, comments } = detail;
  const [replyBody, setReplyBody] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);
  const latestVisitor = [...comments].reverse().find((comment) => !comment.is_admin);
  const replyTo = (comment: StoredComment) => {
    setReplyBody(buildQuotedReply(comment.author_login, comment.body_markdown));
    window.setTimeout(() => composer.current?.focus(), 0);
  };
  return (
    <div className="conversation">
      <header className="conversation__header">
        <Link className="back-button" to="/" aria-label="Back to inbox"><Icon name="back" /></Link>
        <div className="conversation__identity">
          <span className="eyebrow">Issue #{thread.issue_number}</span>
          <h2>{cleanTitle(thread.title)}</h2>
          <div className="conversation__links">
            {thread.article_url ? <a href={thread.article_url} target="_blank" rel="noreferrer"><Icon name="external" />View article</a> : null}
            <a href={thread.github_url} target="_blank" rel="noreferrer"><Icon name="github" />Open issue</a>
            <span className={`state-pill state-pill--${thread.state}`}>{thread.state}</span>
          </div>
        </div>
        <span className="message-count">{comments.length} message{comments.length === 1 ? "" : "s"}</span>
      </header>

      <div className="message-timeline">
        {comments.length ? comments.map((comment) => <CommentCard key={comment.comment_id} comment={comment} onReply={() => replyTo(comment)} />) : (
          <div className="empty-thread"><Icon name="message" /><h3>No messages yet</h3><p>You can start the conversation below.</p></div>
        )}
      </div>
      <ReplyComposer
        issueNumber={thread.issue_number}
        value={replyBody}
        setValue={setReplyBody}
        inputRef={composer}
        disabled={Boolean(thread.locked)}
        suggestion={latestVisitor ? `Reply to @${latestVisitor.author_login}` : "Write a reply"}
      />
    </div>
  );
}

function CommentCard({ comment, onReply }: { comment: StoredComment; onReply: () => void }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) revalidator.revalidate();
  }, [fetcher.state, fetcher.data, revalidator]);
  return (
    <article className={`message ${comment.is_admin ? "message--admin" : ""} ${fetcher.state !== "idle" ? "message--pending" : ""}`}>
      <div className="message__avatar">{comment.author_avatar_url ? <img src={comment.author_avatar_url} alt="" /> : <span>{comment.author_login.slice(0, 1).toUpperCase()}</span>}</div>
      <div className="message__card">
        <header><strong>{comment.author_login}</strong>{comment.is_admin ? <span className="admin-badge">You</span> : null}<time dateTime={comment.created_at}>{relativeTime(comment.created_at)}</time></header>
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: comment.body_html }} />
        <footer>
          <button type="button" onClick={onReply}><Icon name="reply" />Reply</button>
          <a href={comment.github_url} target="_blank" rel="noreferrer">Permalink</a>
          {!comment.is_admin ? (
            <fetcher.Form method="delete" action={`/api/comments/${comment.comment_id}`}>
              <button className="delete-button" type="submit" disabled={fetcher.state !== "idle"} title="Permanently delete this comment"><Icon name="trash" />Delete</button>
            </fetcher.Form>
          ) : null}
        </footer>
        {fetcher.data?.error ? <p className="inline-error">{fetcher.data.error}</p> : null}
      </div>
    </article>
  );
}

function ReplyComposer({ issueNumber, value, setValue, inputRef, disabled, suggestion }: {
  issueNumber: number;
  value: string;
  setValue: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  suggestion: string;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (fetcher.state === "submitting") setSubmitted(true);
    if (submitted && fetcher.state === "idle" && fetcher.data?.ok) {
      setValue("");
      setSubmitted(false);
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator, setValue, submitted]);
  return (
    <div className="composer-wrap">
      <fetcher.Form method="post" action={`/api/threads/${issueNumber}/reply`} className="composer">
        <textarea ref={inputRef} name="body" value={value} onChange={(event) => setValue(event.target.value)} placeholder={disabled ? "This conversation is locked" : suggestion} disabled={disabled || fetcher.state !== "idle"} rows={5} />
        <div className="composer__footer">
          <span>Markdown supported · Replies post as ChrisTitusTech</span>
          <button className="button button--primary" type="submit" disabled={disabled || !value.trim() || fetcher.state !== "idle"}>{fetcher.state !== "idle" ? "Sending..." : "Send reply"}<Icon name="send" /></button>
        </div>
        {fetcher.data?.error ? <p className="inline-error">{fetcher.data.error}</p> : null}
      </fetcher.Form>
    </div>
  );
}

function NoSelection({ hasThreads }: { hasThreads: boolean }) {
  return <div className="no-selection"><div className="no-selection__icon"><Icon name={hasThreads ? "message" : "inbox"} /></div><h2>{hasThreads ? "Choose a conversation" : "Your inbox is ready"}</h2><p>{hasThreads ? "Select a thread to read and reply." : "Run the first sync to import Utterances comments from GitHub."}</p></div>;
}

function PageLink({ page, disabled, params, children }: { page: number; disabled: boolean; params: URLSearchParams; children: React.ReactNode }) {
  if (disabled) return <span className="disabled">{children}</span>;
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  next.delete("thread");
  return <Link to={`/?${next}`}>{children}</Link>;
}

function cleanTitle(value: string): string {
  const title = value.replace(/^\/+|\/+$/gu, "").replaceAll("-", " ");
  return title.replace(/\b\w/gu, (character) => character.toUpperCase());
}

function Icon({ name, spin = false }: { name: string; spin?: boolean }) {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18 9a7 7 0 0 0-12-2L4 11M6 15a7 7 0 0 0 12 2l2-4"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></>,
    inbox: <><path d="M4 4h16v14H4z"/><path d="M4 13h4l2 3h4l2-3h4"/></>,
    message: <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/>,
    external: <><path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></>,
    github: <path d="M12 2a10 10 0 0 0-3 19.5v-2.1c-2.4.5-3-1-3-1-.4-1.1-1-1.4-1-1.4-.9-.6.1-.6.1-.6 1 0 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1 .6-1.2-2-.2-4.2-1-4.2-4.5 0-1 .4-1.8 1-2.5-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.7 1a9 9 0 0 1 4.8 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.5 1 2.5 0 3.5-2.1 4.3-4.2 4.5.4.3.7.9.7 1.8v2.7A10 10 0 0 0 12 2Z"/>,
    back: <><path d="m15 18-6-6 6-6"/></>,
    reply: <><path d="m9 17-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
  };
  return <svg className={spin ? "spin" : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
