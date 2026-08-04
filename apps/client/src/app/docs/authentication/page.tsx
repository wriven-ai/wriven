import { CodeBlock } from '../../../components/docs/code-block';
import {
  Callout,
  DocTitle,
  H2,
  InlineCode,
  Lead,
  NextLink,
  P,
  ParamTable,
} from '../../../components/docs/prose';

export const metadata = { title: 'Authentication · Wriven Docs' };

export default function AuthenticationPage() {
  return (
    <article>
      <DocTitle>Authentication</DocTitle>
      <Lead>
        The Delivery API authenticates with project-scoped API keys, sent as a
        Bearer token. A key only ever reaches the project it was created in.
      </Lead>

      <H2>Creating a key</H2>
      <P>
        In the dashboard, open your project → <InlineCode>API Keys</InlineCode> →
        create a key. Choose a scope, then copy the token. The full token is shown
        once and stored only as a hash.
      </P>

      <H2>Scopes</H2>
      <ParamTable
        rows={[
          {
            name: 'read',
            type: 'wrk_live_…',
            desc: 'Published content only. Safe to use from production sites.',
          },
          {
            name: 'preview',
            type: 'wrk_preview_…',
            desc: 'Drafts + published. For preview / staging builds. Never cached.',
          },
          {
            name: 'manage',
            type: 'wrk_admin_…',
            desc: 'Full access. Keep server-side only — never expose in a browser.',
          },
        ]}
      />

      <H2>Sending the token</H2>
      <P>
        Pass the token in the <InlineCode>Authorization</InlineCode> header:
      </P>
      <CodeBlock
        lang="http"
        code={`GET /v1/projects/PROJECT_ID/content/blog_post HTTP/1.1
Host: api.wriven.com
Authorization: Bearer wrk_live_xxx`}
      />

      <Callout type="warning" title="// KEEP KEYS SECRET">
        Store keys in server environment variables (e.g.{' '}
        <InlineCode>process.env.WRIVEN_TOKEN</InlineCode>). Never commit them.
        Only a <InlineCode>read</InlineCode> key is safe in client-side code, and
        even then prefer fetching on the server.
      </Callout>

      <H2>Revoking</H2>
      <P>
        Revoke a key from the same page. Revocation is immediate (within a short
        cache window) and permanent — sites using it stop working, so rotate
        first.
      </P>

      <H2>Errors</H2>
      <ParamTable
        rows={[
          { name: '401', type: 'Unauthorized', desc: 'Missing, invalid, revoked, or expired key.' },
          { name: '403', type: 'Forbidden', desc: 'Key lacks the required scope, or targets another project.' },
          { name: '404', type: 'Not Found', desc: 'Unknown content type or entry slug.' },
        ]}
      />

      <NextLink href="/docs/content-modeling" title="Content Modeling" />
    </article>
  );
}
