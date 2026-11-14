// SMTP sender shared by Edge Functions that e-mail staff (same settings as notify-lead:
// SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_REPLY_TO).
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

import { env, envOptional } from "./env.ts";

export async function sendMail(to: string[], subject: string, html: string, text: string): Promise<void> {
  const port = Number(envOptional("SMTP_PORT") ?? "465");
  const secure = (envOptional("SMTP_SECURE") ?? (port === 465 ? "true" : "false")) === "true";
  const client = new SMTPClient({
    connection: {
      hostname: env("SMTP_HOST"),
      port,
      tls: secure,
      auth: { username: env("SMTP_USER"), password: env("SMTP_PASSWORD") },
    },
  });
  try {
    // SMTP (RFC 5322) requires CRLF line endings; some providers reject bare LF with a 552.
    const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");
    await client.send({
      from: envOptional("SMTP_FROM") ?? env("SMTP_USER"),
      to,
      replyTo: envOptional("SMTP_REPLY_TO") ?? envOptional("SMTP_FROM") ?? env("SMTP_USER"),
      subject: subject.replace(/[\r\n]+/g, " "),
      content: crlf(text),
      html: crlf(html),
    });
  } finally {
    try {
      await client.close();
    } catch {
      // connection already closed
    }
  }
}
