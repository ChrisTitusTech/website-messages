export function buildQuotedReply(author: string, body: string): string {
  const excerpt = body.trim().slice(0, 1000);
  const suffix = body.trim().length > 1000 ? "..." : "";
  const quote = `${excerpt}${suffix}`
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return `${quote}\n\n@${author} `;
}

export function relativeTime(value: string, now = Date.now()): string {
  const delta = new Date(value).getTime() - now;
  const absolute = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absolute < 60_000) return formatter.format(Math.round(delta / 1000), "second");
  if (absolute < 3_600_000) return formatter.format(Math.round(delta / 60_000), "minute");
  if (absolute < 86_400_000) return formatter.format(Math.round(delta / 3_600_000), "hour");
  if (absolute < 2_592_000_000) return formatter.format(Math.round(delta / 86_400_000), "day");
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
