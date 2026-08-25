import type { MailContent } from './layout';
import {
  renderInvitation,
  renderPasswordReset,
  renderVerification,
} from './index';

const LINK = 'https://app.example.com/reset?token=abc';

describe('renderPasswordReset', () => {
  it('returns subject/text/html', () => {
    const mail = renderPasswordReset({ link: LINK });
    expect(mail).toMatchObject({
      subject: 'Reset your Wriven password',
    });
    expect(typeof mail.text).toBe('string');
    expect(mail.html).toContain('<!DOCTYPE html>');
  });

  it('includes the raw link in the text body', () => {
    const mail = renderPasswordReset({ link: LINK });
    expect(mail.text).toContain(LINK);
  });

  it('escapes the recipient name in the html body', () => {
    const mail = renderPasswordReset({
      name: '<script>alert(1)</script>',
      link: LINK,
    });
    expect(mail.html).not.toContain('<script>alert(1)</script>');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('defaults the expiry phrase to "1 hour" and honors an override', () => {
    expect(renderPasswordReset({ link: LINK }).html).toContain(
      'expires in 1 hour',
    );
    expect(
      renderPasswordReset({ link: LINK, expiresIn: '30 minutes' }).text,
    ).toContain('30 minutes');
  });
});

describe('renderVerification', () => {
  it('returns the code and link in both bodies', () => {
    const mail = renderVerification({ link: LINK, code: '123456' });
    expect(mail.text).toContain('123456');
    expect(mail.text).toContain(LINK);
    expect(mail.html).toContain('123456');
  });

  it('escapes the code in the html body', () => {
    const mail = renderVerification({ link: LINK, code: '1"2<3>' });
    expect(mail.html).toContain('1&quot;2&lt;3&gt;');
  });

  it('defaults and overrides the code/link expiry phrases', () => {
    const mail = renderVerification({ link: LINK, code: '123456' });
    expect(mail.text).toContain('valid for 10 minutes');
    expect(mail.text).toContain('link expires in 24 hours');
    const custom = renderVerification({
      link: LINK,
      code: '123456',
      codeExpiresIn: '5 minutes',
      expiresIn: '12 hours',
    });
    expect(custom.text).toContain('valid for 5 minutes');
    expect(custom.text).toContain('12 hours');
  });
});

describe('renderInvitation', () => {
  const data = {
    inviterName: 'Ada <Admin>',
    targetName: 'Acme <Corp>',
    scope: 'workspace' as const,
    role: 'Member',
    link: LINK,
  };

  it('uses the raw inviter/target names in the subject (plain text)', () => {
    const mail = renderInvitation(data);
    expect(mail.subject).toBe('Ada <Admin> invited you to Acme <Corp> on Wriven');
  });

  it('escapes inviter, target and role in the html body', () => {
    const mail = renderInvitation(data);
    expect(mail.html).not.toContain('<Admin>');
    expect(mail.html).toContain('Ada &lt;Admin&gt;');
    expect(mail.html).toContain('Acme &lt;Corp&gt;');
  });

  it('falls back to "Someone" for a missing or blank inviter name', () => {
    expect(
      renderInvitation({ ...data, inviterName: null }).subject,
    ).toContain('Someone invited you');
    expect(renderInvitation({ ...data, inviterName: '   ' }).subject).toContain(
      'Someone invited you',
    );
  });

  it('scopes copy to project vs workspace', () => {
    const project = renderInvitation({ ...data, scope: 'project' });
    const workspace = renderInvitation(data);
    expect(project.text).toContain('access to their project on Wriven');
    expect(workspace.text).toContain('inside their workspace');
    expect(project.html).toContain('Project:</span>');
    expect(workspace.html).toContain('Workspace:</span>');
  });

  it('returns a well-formed MailContent', () => {
    const mail: MailContent = renderInvitation(data);
    expect(Object.keys(mail).sort()).toEqual(['html', 'subject', 'text']);
  });

  it('defaults the expiry phrase to "7 days"', () => {
    expect(renderInvitation(data).text).toContain('expires in 7 days');
  });
});
