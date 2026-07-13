# Repository instructions

- This repository is a private Cloudflare Worker moderation UI for the public
  Utterances comments in `ChrisTitusTech/website`.
- Keep GitHub as the source of truth and D1 as a synchronized inbox cache.
- Do not weaken the exact `ChrisTitusTech` login restriction or broaden GitHub
  App repository permissions without an explicit requirement.
- Do not add a confirmation dialog or audit record to visitor-comment deletion;
  the product decision is one-click permanent deletion.
- Never commit `.dev.vars`, tokens, private keys, client secrets, webhook
  secrets, or session encryption keys.
- Use versioned D1 migrations. Do not edit an already deployed migration.
- Validate changes with `npm run typecheck`, `npm test`, and `npm run build`.
- Preserve accessibility, responsive list/detail navigation, and visible
  mutation error handling.
