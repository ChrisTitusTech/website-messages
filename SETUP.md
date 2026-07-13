# Deployment and operator setup

The code is complete without credentials, but GitHub and Cloudflare require an
administrator to create resources and copy their generated IDs and secrets.

## 1. Create the GitHub App

Under the `ChrisTitusTech` GitHub account, open **Settings > Developer settings
> GitHub Apps > New GitHub App** and use:

- Name: `CTT Website Messages` (or another available private name)
- Homepage URL: the final Worker URL
- Callback URLs:
  - `http://localhost:5173/auth/github/callback`
  - `https://<worker-host>/auth/github/callback`
- Webhook URL: `https://<worker-host>/webhooks/github`
- Webhook secret: a new random value
- Request user authorization during installation: enabled
- Expire user authorization tokens: enabled
- Repository permissions:
  - Metadata: Read-only
  - Issues: Read and write
- Subscribe to events:
  - Issues
  - Issue comment
- Where can this GitHub App be installed?: Only on this account

Generate a private key and install the app on **Only select repositories**, with
only `ChrisTitusTech/website` selected. Record the App ID, Client ID, Client
secret, installation ID, private key PEM, and webhook secret. Never commit them.

## 2. Create D1 and update Wrangler

Authenticate Wrangler and create the database:

```bash
npx wrangler login
npx wrangler d1 create website-messages
```

Replace `replace-after-running-wrangler-d1-create` in `wrangler.jsonc` with the
returned database ID. Change `APP_BASE_URL` to the exact production origin; it
must not have a trailing slash. Then apply migrations:

```bash
npm run db:migrate:remote
```

## 3. Set Worker secrets

Set each value interactively so it does not enter shell history:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
npx wrangler secret put GITHUB_INSTALLATION_ID
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put SESSION_ENCRYPTION_KEY
```

`SESSION_ENCRYPTION_KEY` should be at least 32 cryptographically random
characters. Paste the full private key PEM, including its BEGIN/END lines, when
prompted.

For local development, copy `.dev.vars.example` to `.dev.vars` and fill it with
the same development credentials. `.dev.vars` is ignored by Git.

## 4. Validate and deploy

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run deploy
```

If the assigned Worker hostname differs from the configured production origin,
update `APP_BASE_URL` and the GitHub App callback/webhook URLs, then deploy once
more.

For Cloudflare Workers Builds, connect this repository with production branch
`main`, build command `npm run build`, and deploy command `npx wrangler deploy`.
Configure the same secrets in the Worker settings.

## 5. Initial synchronization

1. Open the deployed app and sign in as `ChrisTitusTech`.
2. Select **Sync** in the header.
3. Leave the tab open until the button returns to its idle state.
4. Confirm the inbox reports Utterances conversations and `/health` returns
   `{ "status": "ok" }`.

GitHub webhooks keep D1 current after the backfill. The Worker also runs a full
reconciliation every day at `09:00 UTC`.

## Behavior and recovery

- Delete is intentionally one click, permanent, and available only on visitor
  comments. GitHub has no undo and this app stores no deletion audit.
- If GitHub is unavailable, existing messages remain readable and the header
  shows the last synchronization error.
- A failed full sync does not prune cached rows; pruning only happens after all
  GitHub issue and comment pages were fetched successfully.
- Rotate a compromised GitHub private key, client secret, webhook secret, or
  session key in both GitHub and Cloudflare. Rotating the session key signs out
  existing sessions.

## Rollback

Use **Workers & Pages > website-messages > Deployments** to roll back to the
previous Worker version. D1 migrations are additive; do not delete the database
during a code rollback. Disable the GitHub App webhook or uninstall the app to
revoke repository access immediately.
