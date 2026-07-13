# Website Messages

A private moderation inbox for the Utterances conversations attached to
[christitus.com](https://christitus.com/). The application reads GitHub issues
created by `utterances-bot` in `ChrisTitusTech/website`, stores a searchable
local view in Cloudflare D1, and lets `ChrisTitusTech` reply or permanently
delete visitor comments.

## Features

- Two-pane, responsive inbox with All, Unread, Needs reply, and Replied views.
- Search by article, GitHub user, or comment text.
- Replies attributed to the signed-in `ChrisTitusTech` GitHub account.
- One-click deletion of visitor comments with no confirmation or retained audit
  record.
- GitHub App OAuth with PKCE, encrypted server-side sessions, and expiring token
  refresh.
- Initial GitHub backfill, signed webhooks, manual sync, and nightly full
  reconciliation.
- Cloudflare Worker SSR, D1 persistence, and no changes to the Hugo website.

## Local development

Prerequisites are Node.js 24+, npm, a Cloudflare account, and a private GitHub
App configured as described in [SETUP.md](SETUP.md).

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The local application is available at `http://localhost:5173`. The checked-in
example contains placeholders only; never commit real GitHub credentials or
encryption keys.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

## Architecture

- React Router v8 renders the authenticated UI on a Cloudflare Worker.
- D1 stores synchronized public issue/comment content, read state, sessions,
  OAuth state, and webhook delivery IDs.
- GitHub App installation tokens perform synchronization. Fine-grained user
  tokens perform replies and deletions so replies appear as `ChrisTitusTech`.
- The UI revalidates every 30 seconds while visible. GitHub remains the source
  of truth.

See [SETUP.md](SETUP.md) for GitHub App registration, D1 creation, secrets,
deployment, initial sync, and rollback instructions.
