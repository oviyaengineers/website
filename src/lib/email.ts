/**
 * Security emails through Resend, for the server only.
 *
 * The API key and the sender address come from server-only environment
 * variables (RESEND_API_KEY, SECURITY_EMAIL_FROM), set in Vercel and never
 * exposed to the browser. Nothing sent here is logged: a message can carry a
 * one-time code.
 */

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("EMAIL_NOT_CONFIGURED");
  }
}

type Email = { to: string; subject: string; text: string; html: string };

async function send(email: Email): Promise<void> {
  if (typeof window !== "undefined") throw new Error("Email is server-only.");
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SECURITY_EMAIL_FROM;
  if (!key || !from) throw new EmailNotConfiguredError();

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    // The status only: the body could echo the message, which may hold a code.
    throw new Error(`EMAIL_SEND_FAILED:${response.status}`);
  }
}

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#10233f">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dbe3ef;border-radius:8px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #dbe3ef;font-size:18px;font-weight:bold">OVIYA ENGINEERS</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 12px;font-size:18px">${escape(title)}</h1>${body}</td></tr>
</table></td></tr></table></body></html>`;
}

const PURPOSE_TEXT: Record<"set" | "change" | "reset", string> = {
  set: "set your Billing & Weight PIN",
  change: "change your Billing & Weight PIN",
  reset: "reset your Billing & Weight PIN",
};

/** The one-time code. It expires in 10 minutes and works once. */
export async function sendSecurityCodeEmail(
  to: string,
  code: string,
  purpose: "set" | "change" | "reset"
): Promise<void> {
  const action = PURPOSE_TEXT[purpose];
  await send({
    to,
    // Never the code in the subject: subjects show on locked phone screens.
    subject: "Your Oviya Engineers security code",
    text: `Use this code to ${action}:\n\n${code}\n\nIt expires in 10 minutes and can be used once.\nIf you did not ask for it, do not share it with anyone and change your login password.\n\nOviya Engineers ERP`,
    html: layout(
      "Your security code",
      `<p style="margin:0 0 16px;font-size:14px">Use this code to ${escape(action)}:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px">${escape(code)}</p>
<p style="margin:0 0 8px;font-size:13px">It expires in 10 minutes and can be used once.</p>
<p style="margin:0;font-size:13px">If you did not ask for it, do not share it with anyone and change your login password.</p>`
    ),
  });
}

const NOTICE: Record<"set" | "change" | "reset", { subject: string; line: string }> = {
  set: {
    subject: "Your Billing & Weight PIN was set",
    line: "A Billing & Weight PIN was set on your account.",
  },
  change: {
    subject: "Your Billing & Weight PIN was changed",
    line: "Your Billing & Weight PIN was changed. The old PIN no longer works.",
  },
  reset: {
    subject: "Your Billing & Weight PIN was reset",
    line: "Your Billing & Weight PIN was reset using an emailed code. The old PIN no longer works.",
  },
};

/** A notice that the PIN was set, changed or reset. It never contains the PIN. */
export async function sendPinNoticeEmail(
  to: string,
  purpose: "set" | "change" | "reset"
): Promise<void> {
  const notice = NOTICE[purpose];
  const when = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
  await send({
    to,
    subject: notice.subject,
    text: `${notice.line}\nTime: ${when} (India)\n\nIf this was not you, log in, reset the PIN with Forgot PIN, and change your login password.\n\nOviya Engineers ERP`,
    html: layout(
      notice.subject,
      `<p style="margin:0 0 12px;font-size:14px">${escape(notice.line)}</p>
<p style="margin:0 0 16px;font-size:13px">Time: ${escape(when)} (India)</p>
<p style="margin:0;font-size:13px">If this was not you, log in, reset the PIN with Forgot PIN, and change your login password.</p>`
    ),
  });
}
