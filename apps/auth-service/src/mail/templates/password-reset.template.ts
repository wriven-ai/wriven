import {
  BODY_COPY_STYLE,
  BRAND,
  escapeHtml,
  renderLayout,
  type MailContent,
} from './layout';

export interface PasswordResetTemplateData {
  /** Recipient's display name, when known. */
  name?: string;
  /** Absolute URL to the reset page (token embedded). */
  link: string;
  /** Human-readable expiry, e.g. `1 hour`. */
  expiresIn?: string;
}

/** Password reset — sent by `MailService.sendPasswordReset`. */
export function renderPasswordReset(
  data: PasswordResetTemplateData,
): MailContent {
  const expiresIn = data.expiresIn ?? '1 hour';
  const subject = 'Reset your Wriven password';
  const greeting = data.name ? `Hi ${escapeHtml(data.name)},` : 'Hi there,';

  const securityNote = `If you didn't request a password reset, you can safely ignore this email — your password will not change. For security, this link expires in ${expiresIn}.`;

  const text = [
    subject,
    '',
    greeting,
    '',
    'We received a request to reset the password for your Wriven account. If that was you, open the link below to choose a new password:',
    '',
    data.link,
    '',
    securityNote,
  ].join('\n');

  const html = renderLayout({
    subject,
    preheader: `Reset your Wriven password — this link expires in ${expiresIn}.`,
    eyebrow: 'Account security',
    title: 'Reset your password',
    bodyHtml: `
      <p style="${BODY_COPY_STYLE}">${greeting}</p>
      <p style="${BODY_COPY_STYLE}">We received a request to reset the password for your <strong style="color:${BRAND.textPrimary}; font-weight:700;">Wriven</strong> account. If that was you, choose a new password by tapping the button below.</p>`,
    cta: { label: 'Reset password', url: data.link },
    fallbackLink: data.link,
    note: `If you didn’t request a password reset, you can safely ignore this email — your password will not change. For security, this link expires in ${expiresIn}.`,
  });

  return { subject, text, html };
}
