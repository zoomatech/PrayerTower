// Outgoing email over SMTP. Any provider with SMTP works (Resend, Postmark,
// Amazon SES, Mailgun, Gmail Workspace...). SMTP_URL unset = no email.
import nodemailer from 'nodemailer';
import type { Config } from '../../config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export type Mailer = (mail: Mail) => Promise<void>;

export function createMailer(config: Pick<Config, 'SMTP_URL' | 'MAIL_FROM'>): Mailer | null {
  if (!config.SMTP_URL) return null;
  const transport = nodemailer.createTransport(config.SMTP_URL);
  const from = config.MAIL_FROM ?? 'Prayer Tower <no-reply@prayertower.app>';
  return async (mail) => {
    await transport.sendMail({ from, ...mail });
  };
}
