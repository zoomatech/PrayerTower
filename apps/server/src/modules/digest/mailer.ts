// Outgoing email over SMTP. Any provider with SMTP works (Resend, Postmark,
// Amazon SES, Mailgun, Gmail Workspace...). SMTP_URL unset = no email.
import nodemailer from 'nodemailer';
import type { Config } from '../../config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** For an Open Circle member or guest: sent under Open Circle's name, never Prayer Tower's. */
  secular?: boolean;
}
export type Mailer = (mail: Mail) => Promise<void>;

/** The sender for Open Circle email: OPEN_CIRCLE_MAIL_FROM, or MAIL_FROM's address under Open Circle's name. */
export function secularFrom(from: string, config: Partial<Pick<Config, 'OPEN_CIRCLE_NAME' | 'OPEN_CIRCLE_MAIL_FROM'>>) {
  if (config.OPEN_CIRCLE_MAIL_FROM) return config.OPEN_CIRCLE_MAIL_FROM;
  const address = /<([^>]+)>\s*$/.exec(from)?.[1] ?? from.trim();
  return `${(config.OPEN_CIRCLE_NAME ?? 'Open Circle').replace(/[<>"]/g, '')} <${address}>`;
}

export function createMailer(config: Pick<Config, 'SMTP_URL' | 'MAIL_FROM'> & Partial<Pick<Config, 'OPEN_CIRCLE_NAME' | 'OPEN_CIRCLE_MAIL_FROM'>>): Mailer | null {
  if (!config.SMTP_URL) return null;
  const transport = nodemailer.createTransport(config.SMTP_URL);
  const from = config.MAIL_FROM ?? 'Prayer Tower <no-reply@prayertower.app>';
  const openCircleFrom = secularFrom(from, config);
  return async ({ secular, ...mail }) => {
    await transport.sendMail({ from: secular ? openCircleFrom : from, ...mail });
  };
}
