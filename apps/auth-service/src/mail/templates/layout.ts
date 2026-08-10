/**
 * Shared email chrome for all Wriven outbound mail.
 *
 * Emails are plain-string templates (no templating engine, no CSS files):
 * table layouts + inline styles are the only primitives that render reliably
 * across Gmail / Outlook / Apple Mail. The tokens below mirror the tenant
 * app's `global.css` light palette so mail feels like the product.
 *
 * Light mode only: `color-scheme: light` forces light rendering in clients
 * that support dark mode, keeping the brand palette faithful.
 */

export interface MailContent {
  /** Email subject line. */
  subject: string;
  /** Plain-text fallback for clients that don't render HTML. */
  text: string;
  /** Full HTML document (bulletproof, inline-styled). */
  html: string;
}

export const BRAND = {
  name: 'Wriven',
  tagline: 'AI-native headless CMS',
  // Light-mode tokens, lifted from apps/client/src/app/global.css.
  accent: '#0b6e4f', // Sovereign Emerald — primary buttons, links
  secondary: '#d97706', // Refined deep amber
  bg: '#faf8f5', // Warm oatmeal eggshell
  surface: '#ffffff', // Pure white paper
  surfaceSoft: '#eef4f0', // Sage-tinted wash
  border: '#dbe5df', // Ice-sage hairline
  textPrimary: '#080d0a', // Ink charcoal
  textSecondary: '#424c46', // Slate pine
  textMuted: '#79857e', // Faint spruce
  font: "'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif",
} as const;

/** Escape user-supplied strings before they are interpolated into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Paragraph style shared by body copy in every template. */
export const BODY_COPY_STYLE = `margin:0 0 16px; font-family:${BRAND.font}; font-size:15px; line-height:1.65; color:${BRAND.textSecondary};`;

export interface LayoutOptions {
  /** Subject line (also used for the <title> tag). */
  subject: string;
  /** Hidden preview text shown next to the subject in most inboxes. */
  preheader: string;
  /** Small uppercase label above the title (e.g. "Account security"). */
  eyebrow: string;
  /** Card headline. */
  title: string;
  /** Card content (paragraphs, panels, …). Inline-styled HTML. */
  bodyHtml: string;
  /** Primary action button. */
  cta?: { label: string; url: string };
  /** Render a "button doesn't work?" fallback with the raw URL. */
  fallbackLink?: string;
  /** Small print at the bottom of the card (security / expiry notes). */
  note?: string;
  /** Small print in the footer; defaults to the generic account line. */
  footerNote?: string;
}

/**
 * Bulletproof CTA: a VML roundrect for Outlook, an inline-styled link
 * everywhere else. Renders identically in Gmail, Apple Mail, and Outlook.
 */
function renderCta(cta: { label: string; url: string }): string {
  const { label, url } = cta;
  const style =
    `font-family:${BRAND.font}; font-size:15px; font-weight:700; line-height:20px; color:#ffffff; text-decoration:none;`;
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 0;">
          <tr>
            <td align="center" bgcolor="${BRAND.accent}" style="background-color:${BRAND.accent}; border-radius:12px; mso-padding-alt:14px 36px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(url)}" style="height:48px; v-text-anchor:middle; width:220px;" arcsize="25%" stroke="f" fillcolor="${BRAND.accent}">
                <w:anchorlock/>
                <center style="color:#ffffff; ${style}">${escapeHtml(label)}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block; padding:14px 36px; border-radius:12px; ${style}">${escapeHtml(label)}</a>
              <!--<![endif]-->
            </td>
          </tr>
        </table>`;
}

/** Wrap every template in the shared Wriven email shell (header + card + footer). */
export function renderLayout(opts: LayoutOptions): string {
  const { subject, preheader, eyebrow, title, bodyHtml } = opts;
  const ctaHtml = opts.cta ? renderCta(opts.cta) : '';
  const fallbackHtml = opts.fallbackLink
    ? `<p style="margin:20px 0 0; font-family:${BRAND.font}; font-size:12px; line-height:1.6; color:${BRAND.textMuted}; word-break:break-all;">If the button doesn’t work, paste this link into your browser:<br/><a href="${escapeHtml(opts.fallbackLink)}" target="_blank" rel="noopener" style="color:${BRAND.accent}; text-decoration:underline;">${escapeHtml(opts.fallbackLink)}</a></p>`
    : '';
  const noteHtml = opts.note
    ? `<p style="margin:24px 0 0; padding-top:20px; border-top:1px solid ${BRAND.border}; font-family:${BRAND.font}; font-size:12px; line-height:1.6; color:${BRAND.textMuted};">${opts.note}</p>`
    : '';
  const footerNote =
    opts.footerNote ??
    'You received this email because you have an account with Wriven.';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .wr-shell { padding: 32px 12px 40px !important; }
      .wr-card { padding: 32px 24px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:${BRAND.bg};" bgcolor="${BRAND.bg}">
  <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" class="wr-shell" style="padding:40px 16px 48px;">
        <!-- Header — Wriven wordmark + emerald dot -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">
          <tr>
            <td align="center" style="padding:0 0 28px;">
              <span style="font-family:${BRAND.font}; font-size:22px; font-weight:800; letter-spacing:-0.4px; color:${BRAND.textPrimary};">Wriven</span>
              <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${BRAND.accent}; margin-left:5px; vertical-align:middle;"></span>
            </td>
          </tr>
        </table>
        <!-- Card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">
          <tr>
            <td class="wr-card" align="left" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface}; border:1px solid ${BRAND.border}; border-radius:16px; padding:40px 40px 36px;">
              <!-- Weft accent bar — echoes the weaving-loom logo threads -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="30" height="4" style="width:30px; height:4px; background-color:${BRAND.accent}; border-radius:2px; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="6" style="width:6px; font-size:0; line-height:0;">&nbsp;</td>
                  <td width="14" height="4" style="width:14px; height:4px; background-color:${BRAND.secondary}; border-radius:2px; font-size:0; line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:20px 0 8px; font-family:${BRAND.font}; font-size:11px; font-weight:800; letter-spacing:1.6px; text-transform:uppercase; color:${BRAND.accent};">${eyebrow}</p>
              <h1 style="margin:0 0 16px; font-family:${BRAND.font}; font-size:24px; font-weight:800; line-height:1.25; letter-spacing:-0.3px; color:${BRAND.textPrimary};">${title}</h1>
              ${bodyHtml}
              ${ctaHtml}
              ${fallbackHtml}
              ${noteHtml}
            </td>
          </tr>
        </table>
        <!-- Footer -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">
          <tr>
            <td align="center" style="padding:24px 16px 0;">
              <p style="margin:0 0 4px; font-family:${BRAND.font}; font-size:12px; line-height:1.6; color:${BRAND.textMuted};">${BRAND.tagline}</p>
              <p style="margin:0; font-family:${BRAND.font}; font-size:12px; line-height:1.6; color:${BRAND.textMuted};">${footerNote}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
