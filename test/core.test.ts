import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { importGitHubPrivateKey, verifyWebhookSignature } from "../app/lib/crypto.server";
import { isUtteranceIssue, issueNumberFromUrl } from "../app/lib/db.server";
import { buildQuotedReply, relativeTime } from "../app/lib/format";
import type { GitHubIssue } from "../app/lib/types";

function issue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    id: 1,
    number: 68,
    title: "beautiful-bash/",
    html_url: "https://github.com/ChrisTitusTech/website/issues/68",
    state: "open",
    locked: false,
    comments: 3,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    body: "[https://christitus.com/beautiful-bash/](https://christitus.com/beautiful-bash/)",
    user: { login: "utterances-bot" },
    ...overrides,
  };
}

describe("Utterances filtering", () => {
  it("accepts bot-created issue threads", () => {
    expect(isUtteranceIssue(issue())).toBe(true);
  });

  it("rejects pull requests and regular issues", () => {
    expect(isUtteranceIssue(issue({ pull_request: {} }))).toBe(false);
    expect(isUtteranceIssue(issue({ user: { login: "someone-else" } }))).toBe(false);
  });

  it("extracts issue numbers from API URLs", () => {
    expect(issueNumberFromUrl("https://api.github.com/repos/ChrisTitusTech/website/issues/270")).toBe(270);
    expect(issueNumberFromUrl("https://api.github.com/repos/example/repo/pulls/1")).toBeNull();
  });
});

describe("reply formatting", () => {
  it("creates an editable GitHub-style quote and mention", () => {
    expect(buildQuotedReply("octocat", "First line\nSecond line"))
      .toBe("> First line\n> Second line\n\n@octocat ");
  });

  it("bounds quoted text", () => {
    const result = buildQuotedReply("octocat", "a".repeat(1_200));
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(1_050);
  });
});

describe("webhook verification", () => {
  it("accepts a valid SHA-256 signature and rejects tampering", async () => {
    const secret = "test-webhook-secret";
    const body = '{"action":"created"}';
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    const signature = `sha256=${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    await expect(verifyWebhookSignature(body, signature, secret)).resolves.toBe(true);
    await expect(verifyWebhookSignature(`${body}x`, signature, secret)).resolves.toBe(false);
    await expect(verifyWebhookSignature(body, null, secret)).resolves.toBe(false);
  });
});

describe("GitHub App private keys", () => {
  it("imports GitHub's PKCS#1 RSA PEM format", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    await expect(importGitHubPrivateKey(pem)).resolves.toBeDefined();
  });
});

describe("relative time", () => {
  it("formats recent timestamps", () => {
    const now = new Date("2026-07-13T12:00:00Z").getTime();
    expect(relativeTime("2026-07-13T11:55:00Z", now)).toBe("5 minutes ago");
  });
});
