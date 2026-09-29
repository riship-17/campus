import nodemailer from 'nodemailer';
import { env, isProd } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let transporter;

/**
 * Real SMTP when configured, otherwise a no-network transport that logs the message.
 * In development that means the verification link appears in your terminal, which is the
 * fastest possible local loop and avoids shipping a fake "email sent" success.
 *
 * Phase 5 moves these calls behind a BullMQ queue with retries; the signature stays the same.
 */
function getTransporter() {
  if (transporter) return transporter;

  if (env.SMTP_HOST && env.SMTP_PORT) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  } else {
    if (isProd) {
      logger.error('SMTP is not configured in production — outbound email is disabled.');
    }
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }

  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  const info = await getTransporter().sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });

  if (!env.SMTP_HOST) {
    logger.info(
      { to, subject, preview: text?.slice(0, 400) },
      'Email captured (no SMTP configured)'
    );
  }

  return info;
}
