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
  /** 6-digit code — the OTP path entered in the app. */
  code: string;
  /** Human-readable link expiry, e.g. `24 hours`. */
  expiresIn?: string;
  /** Human-readable code expiry, e.g. `10 minutes`. */
  codeExpiresIn?: string;
}

/** Email verification — sent by `MailService.sendVerification`. */
export function renderVerification(
  data: VerificationTemplateData,
): MailContent {
  const expiresIn = data.expiresIn ?? '24 hours';
  const codeExpiresIn = data.codeExpiresIn ?? '10 minutes';
  const subject = 'Verify your Wriven email';
  const greeting = data.name ? `Hi ${escapeHtml(data.name)},` : 'Hi there,';

  const text = [
    subject,
    '',
    greeting,
    '',
    'Confirm your email address to finish securing your Wriven account. A verified email keeps your workspace safe and makes account recovery easier.',
    '',
    `Or verify in the app with this code (valid for ${codeExpiresIn}):`,
    data.code,
    '',
    'Verify your email:',
    data.link,
    '',
    `The code expires in ${codeExpiresIn}; the link expires in ${expiresIn}. If you didn't create a Wriven account, you can safely ignore this email.`,
  ].join('\n');

  const html = renderLayout({
    subject,
    preheader: `Confirm your email address to secure your Wriven account — code expires in ${codeExpiresIn}.`,
    eyebrow: 'Email verification',
    title: 'Verify your email address',
    bodyHtml: `
      <p style="${BODY_COPY_STYLE}">${greeting}</p>
      <p style="${BODY_COPY_STYLE}">Confirm your email address to finish securing your <strong style="color:${BRAND.textPrimary}; font-weight:700;">Wriven</strong> account. A verified email keeps your workspace safe and makes account recovery easier.</p>
      <p style="margin:28px 0 8px; font-family:${BRAND.font}; font-size:13px; line-height:1.6; color:${BRAND.textMuted};">Prefer to stay in the app? Enter this code in your profile:</p>
      <div style="margin:0 0 8px; padding:14px 20px; background-color:${BRAND.surfaceSoft}; border:1px solid ${BRAND.border}; border-radius:12px; text-align:center;">
        <span style="font-family:'SFMono-Regular',Consolas,Menlo,monospace; font-size:28px; font-weight:700; letter-spacing:8px; color:${BRAND.textPrimary};">${escapeHtml(data.code)}</span>
      </div>`,
    cta: { label: 'Verify email address', url: data.link },
    fallbackLink: data.link,
    note: `The code expires in ${codeExpiresIn}; the link expires in ${expiresIn}. If you didn’t create a Wriven account, you can safely ignore this email.`,
  });

  return { subject, text, html };
}
