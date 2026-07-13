import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export const meta: Route.MetaFunction = () => [
  { title: "Website Messages" },
  { name: "description", content: "Private Utterances message inbox for Chris Titus Tech" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? error.statusText || String(error.data)
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred";
  return (
    <main className="fatal-error">
      <div className="fatal-error__card">
        <span className="eyebrow">Error {status}</span>
        <h1>Something went sideways.</h1>
        <p>{message}</p>
        <a className="button button--primary" href="/">Return to the inbox</a>
      </div>
    </main>
  );
}
