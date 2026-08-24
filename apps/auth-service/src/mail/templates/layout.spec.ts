import { escapeHtml, renderLayout } from './layout';

describe('escapeHtml', () => {
  it('escapes all five HTML-significant entities', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Wriven invite')).toBe('Wriven invite');
  });
});

describe('renderLayout', () => {
  const base = {
    subject: 'Subject',
    preheader: 'Preview text',
    eyebrow: 'Account security',
    title: 'Card headline',
    bodyHtml: '<p>Body</p>',
  };

  it('escapes the subject into the <title> tag', () => {
    const html = renderLayout({ ...base, subject: '<script>x</script>' });
    expect(html).toContain('<title>&lt;script&gt;x&lt;/script&gt;</title>');
  });

  it('embeds the hidden preheader div', () => {
    const html = renderLayout(base);
    expect(html).toContain('>Preview text&nbsp;');
  });

  it('escapes CTA label and url', () => {
    const html = renderLayout({
      ...base,
      cta: { label: 'Clic"k <here>', url: 'https://x.example/a?b=1&c=2' },
    });
    expect(html).toContain('Clic&quot;k &lt;here&gt;</a>');
    expect(html).toContain('href="https://x.example/a?b=1&amp;c=2"');
  });

  it('renders no CTA markup when cta is omitted', () => {
    const html = renderLayout(base);
    expect(html).not.toContain('v:roundrect');
  });

  it('renders the fallback link block only when provided', () => {
    expect(
      renderLayout({ ...base, fallbackLink: 'https://x.example/l' }),
    ).toContain("If the button doesn’t work");
    expect(renderLayout(base)).not.toContain("If the button doesn’t work");
  });

  it('renders the note block only when provided', () => {
    expect(renderLayout({ ...base, note: 'Security note' })).toContain(
      'Security note',
    );
    expect(renderLayout(base)).not.toContain('border-top:1px solid');
  });

  it('uses the default footer note unless overridden', () => {
    expect(renderLayout(base)).toContain(
      'You received this email because you have an account with Wriven.',
    );
    expect(
      renderLayout({ ...base, footerNote: 'Custom footer' }),
    ).toContain('Custom footer');
  });
});
