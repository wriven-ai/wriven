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
}
