import { CodeBlock } from '../../../components/docs/code-block';
import { Callout, DocTitle, H2, InlineCode, Lead, P } from '../../../components/docs/prose';

export const metadata = { title: 'Rich Text · Wriven Docs' };

export default function RichTextPage() {
  return (
    <article>
      <DocTitle>Rich Text</DocTitle>
      <Lead>
        Rich-text fields are stored as structured JSON (a ProseMirror document),
        not HTML. JSON is portable across web, native and email, safe from HTML
        injection, and transformable. You render it on your side.
      </Lead>

      <H2>The shape</H2>
      <P>
        A rich-text value is a document tree of nodes and marks. The Delivery API
        returns it under the field key, unchanged:
      </P>
      <CodeBlock
        lang="json"
        code={`{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "Hello" }] },
    { "type": "paragraph",
      "content": [
        { "type": "text", "text": "Some " },
        { "type": "text", "marks": [{ "type": "bold" }], "text": "bold" },
        { "type": "text", "text": " copy." }
      ] }
  ]
}`}
      />

      <H2>Render to HTML (server)</H2>
      <P>
        Use TipTap&apos;s <InlineCode>generateHTML</InlineCode> with the same
        extension set the editor uses. Run it on the server and pass the string
        down:
      </P>
      <CodeBlock
        lang="bash"
        code={`npm i @tiptap/html @tiptap/starter-kit`}
      />
      <CodeBlock
        lang="typescript"
        code={`import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";

export function renderRichText(doc: unknown): string {
  return generateHTML(doc, [StarterKit]);
}`}
      />
      <CodeBlock
        lang="tsx"
        code={`// In a Next.js server component
const html = renderRichText(entry.data.body);
return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;`}
      />

      <Callout type="info" title="// REACT RENDERER">
        Prefer real React nodes over <InlineCode>dangerouslySetInnerHTML</InlineCode>?
        Use <InlineCode>@tiptap/static-renderer</InlineCode> to map the JSON to
        your own components — full control over how each node renders.
      </Callout>

      <Callout type="warning" title="// MATCH EXTENSIONS">
        Render with the same extensions the content was authored with. Wriven&apos;s
        editor uses StarterKit (headings, lists, blockquote, code, links). If you
        add custom nodes later, register them in your renderer too.
      </Callout>
    </article>
  );
}
