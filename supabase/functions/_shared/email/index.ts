import { escapeHtml, firstCodePoints, safeHttpUrl } from "../markup/index.ts";

export const EMAIL_EXCERPT_MAX = 500;

export interface NotificationEmailInput {
  kind: "reply" | "mention";
  authorName: string;
  commentBody: string;
  pageUrl: string;
  threadLink: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const SUBJECTS: Record<NotificationEmailInput["kind"], string> = {
  reply: "New reply in Sitenote",
  mention: "You were mentioned in Sitenote",
};

export function renderNotificationEmail(input: NotificationEmailInput): RenderedEmail {
  const author = input.authorName.trim().length > 0 ? input.authorName.trim() : "Someone";
  const intro =
    input.kind === "mention"
      ? `${author} mentioned you in a comment.`
      : `${author} replied in a thread you take part in.`;
  const excerpt = firstCodePoints(input.commentBody.trim(), EMAIL_EXCERPT_MAX);
  const pageHref = safeHttpUrl(input.pageUrl);
  const linkHref = safeHttpUrl(input.threadLink);

  const text = [
    intro,
    "",
    excerpt,
    "",
    `Page: ${input.pageUrl}`,
    `Open the thread: ${input.threadLink}`,
  ].join("\n");

  const pageHtml =
    pageHref === null
      ? escapeHtml(input.pageUrl)
      : `<a href="${escapeHtml(pageHref)}">${escapeHtml(input.pageUrl)}</a>`;
  const threadHtml =
    linkHref === null
      ? escapeHtml(input.threadLink)
      : `<a href="${escapeHtml(linkHref)}">Open the thread</a>`;
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    `<blockquote style="white-space:pre-wrap;margin:0 0 16px;">${escapeHtml(excerpt)}</blockquote>`,
    `<p>Page: ${pageHtml}</p>`,
    `<p>${threadHtml}</p>`,
  ].join("");

  return { subject: SUBJECTS[input.kind], text, html };
}
