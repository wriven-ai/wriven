import {
  BODY_COPY_STYLE,
  BRAND,
  escapeHtml,
  renderLayout,
  type MailContent,
} from './layout';

export interface VerificationTemplateData {
  /** Recipient's display name, when known. */
  name?: string;
  /** Absolute URL to the verification page (token embedded). */
  link: string;
  /** Human-readable expiry, e.g. `24 hours`. */
  expiresIn?: string;
}

/** Email verification — sent by `MailService.sendVerification`. */
export function renderVerification(
  data: VerificationTemplateData,
): MailContent {
  const expiresIn = data.expiresIn ?? '24 hours';
  const subject = 'Verify your Wriven email';
  const greeting = data.name ? `Hi ${escapeHtml(data.name)},` : 'Hi there,';

  const text = [
    subject,
    '',
    greeting,
    '',
    'Confirm your email address to finish securing your Wriven account. A verified email keeps your workspace safe and makes account recovery easier.',
    '',
    'Verify your email:',
    data.link,
    '',
    `This link expires in ${expiresIn}. If you didn't create a Wriven account, you can safely ignore this email.`,
  ].join('\n');

  const html = renderLayout({
    subject,
    preheader: `Confirm your email address to secure your Wriven account — link expires in ${expiresIn}.`,
    eyebrow: 'Email verification',
    title: 'Verify your email address',
    bodyHtml: `
      <p style="${BODY_COPY_STYLE}">${greeting}</p>
      <p style="${BODY_COPY_STYLE}">Confirm your email address to finish securing your <strong style="color:${BRAND.textPrimary}; font-weight:700;">Wriven</strong> account. A verified email keeps your workspace safe and makes account recovery easier.</p>`,
    cta: { label: 'Verify email address', url: data.link },
    fallbackLink: data.link,
    note: `This link expires in ${expiresIn}. If you didn’t create a Wriven account, you can safely ignore this email.`,
  });

  return { subject, text, html };
}
