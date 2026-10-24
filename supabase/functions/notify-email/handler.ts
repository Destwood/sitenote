import { ApiError, errorResponse, jsonResponse } from "../_shared/api/index.ts";
import { describeError, type EnvMap } from "../_shared/runtime/index.ts";
import { parseRequest, insertWebhookBody, readJsonBody } from "../_shared/requests/index.ts";
import { renderNotificationEmail } from "../_shared/email/index.ts";
import { isValidWebhookSecret } from "../_shared/webhook/index.ts";
import { threadLink } from "../_shared/thread-link/index.ts";
import {
  commentForNotification,
  loadNotification,
  loadPageUrl,
  loadRecipient,
  serviceClient,
} from "../_shared/supabase/index.ts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function handleNotifyEmail(
  request: Request,
  env: EnvMap,
  fetchImpl: typeof fetch,
): Promise<Response> {
  try {
    if (request.method !== "POST") {
      throw new ApiError("validation", "Use the POST method");
    }
    if (!isValidWebhookSecret(request.headers.get("X-Webhook-Secret"), env.WEBHOOK_SECRET ?? "")) {
      throw new ApiError("unauthorized", "The webhook secret is invalid");
    }
    const { record } = parseRequest(insertWebhookBody, await readJsonBody(request));
    const apiKey = env.RESEND_API_KEY;
    const from = env.EMAIL_FROM;
    const siteUrl = env.SITE_URL;
    if (
      apiKey === undefined ||
      apiKey === "" ||
      from === undefined ||
      from === "" ||
      siteUrl === undefined ||
      siteUrl === ""
    ) {
      console.log("notify-email skipped: RESEND_API_KEY, EMAIL_FROM or SITE_URL is not set");
      return jsonResponse({ skipped: "not_configured" }, 200);
    }

    const service = serviceClient(env, fetchImpl);
    const notification = await loadNotification(service, record.id);
    if (notification === null) {
      return jsonResponse({ skipped: "not_found" }, 200);
    }
    const recipient = await loadRecipient(service, notification.user_id);
    if (recipient === null || recipient.email === null || recipient.email.length === 0) {
      return jsonResponse({ skipped: "no_email" }, 200);
    }
    const comment = await commentForNotification(service, notification.comment_id);
    if (comment === null || comment.deleted) {
      return jsonResponse({ skipped: "deleted" }, 200);
    }
    const pageUrl = await loadPageUrl(service, notification.thread_id);
    if (pageUrl === null) {
      return jsonResponse({ skipped: "not_found" }, 200);
    }
    const author =
      comment.authorId === null ? null : await loadRecipient(service, comment.authorId);

    const email = renderNotificationEmail({
      kind: notification.kind,
      authorName: author?.displayName ?? "",
      commentBody: comment.body,
      pageUrl,
      threadLink: threadLink(siteUrl, notification.thread_id),
    });
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [recipient.email],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new ApiError("upstream", `Resend responded with HTTP ${String(response.status)}`);
    }
    return jsonResponse({ sent: true }, 200);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error(describeError(error));
    }
    return errorResponse(error);
  }
}
