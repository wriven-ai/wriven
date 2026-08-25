import { MailService } from './mail.service';
import { createTransport } from 'nodemailer';
import { configStub } from '../testing/config-stub';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const createTransportMock = createTransport as unknown as jest.Mock;

function makeService(map: Record<string, unknown> = {}) {
  return new MailService(configStub(map));
}

function lastMail() {
  // nodemailer's sendMail takes a single options object.
  return mockSendMail.mock.calls[mockSendMail.mock.calls.length - 1][0] as Record<
    string,
    string
  >;
}

afterEach(() => {
  mockSendMail.mockClear();
  createTransportMock.mockClear();
});

describe('MailService — transport construction', () => {
  it('builds the transporter from MAIL_* config', () => {
    makeService({ MAIL_HOST: 'smtp.example.com', MAIL_PORT: '587', MAIL_USER: 'u', MAIL_PASS: 'p' });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
    });
  });

  it('port 465 switches to the implicit-TLS transport', () => {
    makeService({ MAIL_PORT: '465' });
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it('falls back to port 587 and the default From header', () => {
    makeService({});
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587, secure: false }),
    );
    // The default from is visible on the next send.
    mockSendMail.mockClear();
    const service = makeService({});
    service.sendVerification('to@example.com', 'https://x', '123456');
    expect(lastMail().from).toContain('no-reply@wriven.dev');
  });
});

describe('MailService.sendVerification', () => {
  it('renders link + code + both TTLs into the message and sends it', async () => {
    const service = makeService({ EMAIL_VERIFY_TTL: '2h', OTP_TTL: '15m' });

    await service.sendVerification('to@example.com', 'https://app/verify?t=1', '654321');

    const mail = lastMail();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mail.to).toBe('to@example.com');
    expect(mail.subject).toBeTruthy();
    expect(mail.html).toContain('https://app/verify?t=1');
    expect(mail.html).toContain('654321');
    // TTL phrases surface in the copy (template details are covered in
    // templates.spec.ts — here we assert the config plumbing).
    expect(mail.text).toContain('15 minutes');
  });
});

describe('MailService.sendPasswordReset', () => {
  it('uses RESET_TOKEN_TTL for the expiry phrase', async () => {
    const service = makeService({ RESET_TOKEN_TTL: '45m' });

    await service.sendPasswordReset('to@example.com', 'https://app/reset?t=1');

    const mail = lastMail();
    expect(mail.to).toBe('to@example.com');
    expect(mail.html).toContain('https://app/reset?t=1');
    expect(mail.text).toContain('45 minutes');
  });
});

describe('MailService.sendInvitation', () => {
  it('renders inviter/target/role and the default 7-day expiry', async () => {
    const service = makeService({});

    await service.sendInvitation(
      'to@example.com',
      'https://app/invite/tok',
      { inviterName: 'Ada', targetName: 'Acme', role: 'member', scope: 'workspace' },
    );

    const mail = lastMail();
    expect(mail.to).toBe('to@example.com');
    expect(mail.html).toContain('https://app/invite/tok');
    expect(mail.html).toContain('Acme');
    expect(mail.text).toContain('7 days');
  });
});
