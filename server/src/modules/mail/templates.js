import { env } from '../../config/env.js';

/**
 * Plain, readable HTML. No tracking pixels, no marketing voice — this is campus
 * administrative mail and it should read like it.
 */
function layout({ heading, body, action }) {
  const button = action
    ? `<p style="margin:24px 0;">
         <a href="${action.href}" style="display:inline-block;background:#B8432F;color:#ffffff;
            padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:600;
            font-family:Helvetica,Arial,sans-serif;font-size:14px;">${action.label}</a>
       </p>
       <p style="font-size:13px;color:#6B6660;">If the button does not work, paste this into your browser:<br>
         <span style="word-break:break-all;">${action.href}</span></p>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F6F3EE;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
        style="background:#ffffff;border:1px solid rgba(26,26,26,0.12);border-radius:4px;">
        <tr><td style="padding:24px;font-family:Georgia,'Times New Roman',serif;">
          <p style="margin:0 0 4px;font-family:Helvetica,Arial,sans-serif;font-size:11px;
             letter-spacing:0.12em;text-transform:uppercase;color:#6B6660;">CampusConnect</p>
          <h1 style="margin:0 0 16px;font-size:22px;color:#1A1A1A;">${heading}</h1>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:#1A1A1A;">
            ${body}
            ${button}
          </div>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid rgba(26,26,26,0.12);
          font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6B6660;">
          Sent by the Student Affairs Council. Replies to this address are not monitored.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function verificationEmail({ name, token }) {
  const href = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Confirm your CampusConnect email',
    text: `Hi ${name},\n\nConfirm your college email to finish setting up CampusConnect:\n${href}\n\nThe link works for 30 minutes. If you did not create an account, ignore this message.`,
    html: layout({
      heading: 'Confirm your email',
      body: `<p>Hi ${name},</p>
             <p>Confirm your college email so you can register for events and collect certificates.</p>
             <p style="color:#6B6660;">The link works for 30 minutes.</p>`,
      action: { href, label: 'Confirm email' },
    }),
  };
}

export function passwordResetEmail({ name, token }) {
  const href = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Reset your CampusConnect password',
    text: `Hi ${name},\n\nUse this link to set a new password:\n${href}\n\nThe link works for 15 minutes and can be used once. If you did not ask for this, no action is needed.`,
    html: layout({
      heading: 'Reset your password',
      body: `<p>Hi ${name},</p>
             <p>Use the link below to set a new password. It works once and expires in 15 minutes.</p>
             <p style="color:#6B6660;">If you did not ask for this, no action is needed — your current password still works.</p>`,
      action: { href, label: 'Set a new password' },
    }),
  };
}

export function passwordChangedEmail({ name }) {
  return {
    subject: 'Your CampusConnect password was changed',
    text: `Hi ${name},\n\nYour password was changed just now and every signed-in device was signed out.\n\nIf this was not you, contact the SAC office immediately.`,
    html: layout({
      heading: 'Your password was changed',
      body: `<p>Hi ${name},</p>
             <p>Your password changed just now, and every signed-in device was signed out.</p>
             <p><strong>If this was not you</strong>, contact the Student Affairs Council office immediately.</p>`,
    }),
  };
}
