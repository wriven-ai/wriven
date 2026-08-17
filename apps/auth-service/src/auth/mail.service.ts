import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { durationToHuman } from '../common/duration';
import { renderInvitation } from '../mail/templates/invitation.template';
import { renderPasswordReset } from '../mail/templates/password-reset.template';
import { renderVerification } from '../mail/templates/verification.template';

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
    const { subject, text, html } = renderPasswordReset({
      link,
      expiresIn: durationToHuman(
        this.config.get<string>('RESET_TOKEN_TTL', '1h'),
      ),
    });
    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
    });
    this.logger.log(`Password reset email sent to ${to} (id: ${info.messageId})`);
  }

  async sendInvitation(
    to: string,
    link: string,
    meta: {
      inviterName: string | null;
      targetName: string;
      role: string;
      scope: 'workspace' | 'project';
    },
    expiresIn = '7 days',
  ): Promise<void> {
    const { subject, text, html } = renderInvitation({
      inviterName: meta.inviterName,
      targetName: meta.targetName,
      role: meta.role,
      scope: meta.scope,
      link,
      expiresIn,
    });
    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
    });
    this.logger.log(`Invitation email sent to ${to} (id: ${info.messageId})`);
  }

  async sendVerification(to: string, link: string, code: string): Promise<void> {
    const { subject, text, html } = renderVerification({
      link,
      code,
      expiresIn: durationToHuman(
        this.config.get<string>('EMAIL_VERIFY_TTL', '24h'),
      ),
      codeExpiresIn: durationToHuman(
        this.config.get<string>('OTP_TTL', '10m'),
      ),
    });
    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
    });
    this.logger.log(`Verification email sent to ${to} (id: ${info.messageId})`);
  }
}
