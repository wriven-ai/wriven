import {
  BODY_COPY_STYLE,
  BRAND,
  escapeHtml,
  renderLayout,
  type MailContent,
} from './layout';

export type InvitationScope = 'workspace' | 'project';

export interface InvitationTemplateData {
  /** Display name of the person who sent the invite. */
  inviterName?: string | null;
  /** Workspace or project the recipient is invited to. */
  targetName: string;
  /** What the recipient is being invited into (drives the copy). */
  scope: InvitationScope;
  /** Role they're invited as (e.g. "Member", "Editor", "Viewer"). */
  role: string;
  /** Absolute accept URL (token embedded). */
  link: string;
  /** Human-readable expiry, e.g. `7 days`. */
  expiresIn?: string;
}

/** Workspace / project invitation — sent by `MailService.sendInvitation`. */
export function renderInvitation(
  data: InvitationTemplateData,
): MailContent {
  const expiresIn = data.expiresIn ?? '7 days';
  // Subject lines are plain text — use raw values; the HTML body uses the
  // escaped copies below so names with `&`, `<`, etc. can't break markup.
  const rawInviter = data.inviterName?.trim() ? data.inviterName : 'Someone';
  const inviter = escapeHtml(rawInviter);
  const target = escapeHtml(data.targetName);
  const role = escapeHtml(data.role);
  const isProject = data.scope === 'project';

  const scopeCopyHtml = isProject
    ? 'You’ll get access to their project on Wriven and can start collaborating right away.'
    : 'You’ll be able to collaborate on projects and content inside their workspace.';
  const scopeCopyText = isProject
    ? 'You will get access to their project on Wriven and can start collaborating right away.'
    : 'You will be able to collaborate on projects and content inside their workspace.';

  const subject = `${rawInviter} invited you to ${data.targetName} on Wriven`;

  const text = [
    subject,
    '',
    `${inviter} invited you to join ${target} on Wriven as ${role}.`,
    scopeCopyText,
    '',
    'Accept the invitation:',
    data.link,
    '',
    `New to Wriven? You can create your account when you accept. This invitation expires in ${expiresIn}.`,
  ].join('\n');

  const html = renderLayout({
    subject,
    preheader: `${inviter} invited you to join ${target} on Wriven as ${role}.`,
    eyebrow: 'Invitation',
    title: `You’re invited to ${target}`,
    bodyHtml: `
      <p style="${BODY_COPY_STYLE}"><strong style="color:${BRAND.textPrimary}; font-weight:700;">${inviter}</strong> invited you to join <strong style="color:${BRAND.textPrimary}; font-weight:700;">${target}</strong> on Wriven as <strong style="color:${BRAND.textPrimary}; font-weight:700;">${role}</strong>.</p>
      <p style="${BODY_COPY_STYLE}">${scopeCopyHtml}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px; background-color:${BRAND.surfaceSoft}; border:1px solid ${BRAND.border}; border-radius:10px;">
        <tr>
          <td style="padding:14px 18px; font-family:${BRAND.font}; font-size:13px; line-height:1.7; color:${BRAND.textSecondary};">
            <span style="font-weight:800; color:${BRAND.textPrimary};">${isProject ? 'Project' : 'Workspace'}:</span> ${target}<br />
            <span style="font-weight:800; color:${BRAND.textPrimary};">Role:</span> ${role}<br />
            <span style="font-weight:800; color:${BRAND.textPrimary};">Expires:</span> in ${expiresIn}
          </td>
        </tr>
      </table>
      <p style="${BODY_COPY_STYLE} margin:16px 0 0;">New to Wriven? No problem — you can create your account when you accept, in less than a minute.</p>`,
    cta: { label: 'Accept invitation', url: data.link },
    fallbackLink: data.link,
    note: `This invitation expires in ${expiresIn}. If you weren’t expecting this, you can safely ignore this email.`,
    footerNote:
      'You received this invitation because someone wants to collaborate with you on Wriven.',
  });

  return { subject, text, html };
}
