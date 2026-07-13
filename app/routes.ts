import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/inbox.tsx"),
  route("login", "routes/login.tsx"),
  route("auth/github", "routes/auth-github.ts"),
  route("auth/github/callback", "routes/auth-callback.ts"),
  route("logout", "routes/logout.ts"),
  route("api/sync", "routes/api-sync.ts"),
  route("api/threads/:issueNumber/read", "routes/api-read.ts"),
  route("api/threads/:issueNumber/reply", "routes/api-reply.ts"),
  route("api/comments/:commentId", "routes/api-comment.ts"),
  route("webhooks/github", "routes/webhook-github.ts"),
  route("health", "routes/health.ts"),
] satisfies RouteConfig;
