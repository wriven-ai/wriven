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

export const metadata = { title: 'Content & Entries · Wriven Docs' };

export default function EntriesPage() {
  return (
    <article>
      <DocTitle>Content &amp; Entries</DocTitle>
      <Lead>
        An entry is one record of a content type — one blog post, one product.
        This page covers the fields every entry has, how status works, slugs, and
        version history.
      </Lead>

      <H2>Entry anatomy</H2>
      <P>Every entry returned by the Delivery API has these system fields, plus its typed <InlineCode>data</InlineCode>:</P>
      <ParamTable
        rows={[
          { name: 'id', type: 'string', desc: 'Stable entry id.' },
          { name: 'type', type: 'string', desc: 'The content type apiId, e.g. blog_post.' },
          { name: 'slug', type: 'string', desc: 'Unique, URL-safe identifier used in get-by-slug requests.' },
          { name: 'data', type: 'object', desc: 'The field values, keyed by each field’s key. Shape depends on the content type.' },
          { name: 'publishedAt', type: 'string | null', desc: 'ISO timestamp of last publish, or null if never published.' },
          { name: 'updatedAt', type: 'string', desc: 'ISO timestamp of the most recent change.' },
        ]}
      />

      <H2>Status lifecycle</H2>
      <P>An entry is always in one of three statuses:</P>
      <ParamTable
        rows={[
          { name: 'draft', type: 'status', desc: 'Work in progress. Invisible to the live site.' },
          { name: 'published', type: 'status', desc: 'Live. The only status the Delivery API returns to a read key.' },
          { name: 'archived', type: 'status', desc: 'Taken offline. Not returned by the Delivery API.' },
        ]}
      />
      <Callout type="warning" title="// DRAFTS NEVER SHIP">
        The Delivery API returns <InlineCode>published</InlineCode> entries only.
        Drafts are reachable solely through a preview key — never on your
        production site.
      </Callout>

      <H2>Slugs</H2>
      <P>
        Each entry has a system <InlineCode>slug</InlineCode> that is unique within
        its content type and project. It must be kebab-case (letters, numbers,
        hyphens). You read a single entry by slug:
      </P>
      <ParamTable
        rows={[
          { name: 'GET', type: 'endpoint', desc: '/v1/projects/{projectId}/content/{apiId}/{slug} — returns one published entry.' },
        ]}
      />
      <P>
        Two published entries of the same type cannot share a slug; saving a
        duplicate returns <InlineCode>409 CONFLICT</InlineCode>.
      </P>

      <H2>Revisions</H2>
      <P>
        Wriven keeps a revision every time an entry is saved or published. You can
        browse and restore previous versions from the editor in the dashboard.
        Revisions are an authoring concern — they are part of the Management API,
        not the public Delivery API, so they never appear in what your site reads.
      </P>

      <NextLink href="/docs/rich-text" title="Rich Text" />
    </article>
  );
}
