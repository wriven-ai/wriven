import { CodeBlock } from '../../../components/docs/code-block';
import {
  Callout,
  DocTitle,
  H2,
  InlineCode,
  Lead,
  NextLink,
  P,
} from '../../../components/docs/prose';

export const metadata = { title: 'Media & Images · Wriven Docs' };

export default function MediaDocsPage() {
  return (
    <article>
      <DocTitle>Media &amp; Images</DocTitle>
      <Lead>
        The Delivery API returns media as ready-to-render objects — resolved URLs
        plus dimensions and alt text. You never store or build URLs yourself.
      </Lead>

      <H2>Media fields</H2>
      <P>
        A field of type <InlineCode>media</InlineCode> stores an asset reference.
        In delivery responses it is resolved to an object (or an array when the
        field is <InlineCode>multiple</InlineCode>). A deleted asset resolves to{' '}
        <InlineCode>null</InlineCode>.
      </P>
      <CodeBlock
        lang="json"
        code={`{
  "id": "…",
  "slug": "hello-world",
  "data": {
    "title": "Hello World",
    "cover": {
      "id": "a1b2c3",
      "url": "https://cdn.wriven.com/projects/…/cover.jpg",
      "alt": "Sunrise over the hills",
      "width": 1200,
      "height": 630,
      "mime": "image/jpeg"
    }
  }
}`}
      />

      <H2>Images inside rich text</H2>
      <P>
        Images placed in a <InlineCode>richtext</InlineCode> body are stored as
        reference nodes and hydrated the same way on delivery — each{' '}
        <InlineCode>image</InlineCode> node carries a resolved{' '}
        <InlineCode>src</InlineCode> plus dimensions, so you can render it directly
        from the ProseMirror JSON.
      </P>
      <CodeBlock
        lang="json"
        code={`{
  "type": "image",
  "attrs": {
    "assetId": "a1b2c3",
    "src": "https://cdn.wriven.com/projects/…/inline.png",
    "alt": "Diagram",
    "width": 960,
    "height": 540,
    "mime": "image/png"
  }
}`}
      />

      <Callout type="info" title="// KEYS ONLY">
        Wriven stores object keys, never URLs. The public URL is built at read
        time — so a CDN, custom domain, or future image-transform layer can change
        without rewriting your content.
      </Callout>

      <H2>Optimizing in the consumer</H2>
      <P>
        No transform parameters are applied server-side yet. Use your framework&apos;s
        image pipeline (e.g. <InlineCode>next/image</InlineCode>) against the
        returned <InlineCode>url</InlineCode>/<InlineCode>src</InlineCode> and the
        provided <InlineCode>width</InlineCode>/<InlineCode>height</InlineCode>.
      </P>

      <NextLink href="/docs/preview" title="Preview & Drafts" />
    </article>
  );
}
