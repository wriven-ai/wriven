import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from =
      this.config.get<string>('MAIL_FROM') || 'Wriven <no-reply@wriven.dev>';
    this.transporter = createTransport({
      host: this.config.get<string>('MAIL_HOST'),
      port: Number(this.config.get('MAIL_PORT', 587)),
      secure: Number(this.config.get('MAIL_PORT', 587)) === 465,
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASS'),
      },
    });
  }

  async sendPasswordReset(to: string, link: string): Promise<void> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Reset your Wriven password',
      text: `Reset your password using the link below:\n\n${link}\n\nThis link expires soon. If you didn't request a reset, ignore this email.`,
      html: `
        <p>Reset your password using the link below:</p>
        <p><a href="${link}">${link}</a></p>
        <p>This link expires soon. If you didn't request a reset, you can safely ignore this email.</p>`,
    });
    this.logger.log(`Password reset email sent to ${to} (id: ${info.messageId})`);
  }

  async sendInvitation(
    to: string,
    link: string,
    meta: { inviterName: string | null; targetName: string; role: string },
  ): Promise<void> {
    const inviter = meta.inviterName ?? 'Someone';
    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `You've been invited to ${meta.targetName} on Wriven`,
      text: `${inviter} invited you to ${meta.targetName} as ${meta.role}.\n\nAccept the invitation:\n${link}\n\nThis invite expires in 7 days.`,
      html: `
        <p><strong>${inviter}</strong> invited you to <strong>${meta.targetName}</strong> as <strong>${meta.role}</strong>.</p>
        <p><a href="${link}">Accept the invitation</a></p>
        <p>Or paste this link: ${link}</p>
        <p>This invite expires in 7 days.</p>`,
    });
    this.logger.log(`Invitation email sent to ${to} (id: ${info.messageId})`);
  }

  async sendVerification(to: string, link: string): Promise<void> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Verify your Wriven email',
      text: `Welcome to Wriven! Verify your email using the link below:\n\n${link}\n\nThis link expires soon.`,
      html: `
        <p>Welcome to Wriven! Verify your email using the link below:</p>
        <p><a href="${link}">${link}</a></p>
        <p>This link expires soon.</p>`,
    });
    this.logger.log(`Verification email sent to ${to} (id: ${info.messageId})`);
  }
}
