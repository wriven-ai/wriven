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

export const metadata = { title: 'Content Modeling · Wriven Docs' };

export default function ContentModelingPage() {
  return (
    <article>
      <DocTitle>Content Modeling</DocTitle>
      <Lead>
        A content type is the schema for one kind of content — a blog post, a
        product, a team member. It has a machine id and a list of fields. Entries
        you create fill those fields, and the Delivery API returns them as{' '}
        <InlineCode>data</InlineCode>.
      </Lead>

      <H2>The shape</H2>
      <P>
        Each content type has a display <InlineCode>name</InlineCode> and an{' '}
        <InlineCode>apiId</InlineCode>. The <InlineCode>apiId</InlineCode> is the
        segment you put in Delivery API paths — for example{' '}
        <InlineCode>blog_post</InlineCode> becomes{' '}
        <InlineCode>/content/blog_post</InlineCode>.
      </P>
      <Callout type="info" title="// APIID IS PERMANENT">
        Pick a stable, lowercase <InlineCode>apiId</InlineCode> (kebab or snake)
        before you go live. It is the key every consumer request depends on.
      </Callout>

      <H2>Field types</H2>
      <P>Every field has one of these types. The type decides how the value looks in a delivery response.</P>
      <ParamTable
        rows={[
          { name: 'text', type: 'string', desc: 'Plain text — titles, names, short strings.' },
          { name: 'richtext', type: 'object', desc: 'Formatted body. Stored as a ProseMirror document; render with a rich-text renderer.' },
          { name: 'number', type: 'number', desc: 'Numeric values — price, quantity, order.' },
          { name: 'boolean', type: 'boolean', desc: 'True / false flags — featured, inStock.' },
          { name: 'date', type: 'string', desc: 'ISO date string.' },
          { name: 'select', type: 'string', desc: 'One value from a fixed options list — category, status. Use multiple for arrays.' },
          { name: 'media', type: 'object', desc: 'An image or file. Auto-resolved to { url, alt, width, height, mime } in delivery. Use multiple for galleries.' },
          { name: 'reference', type: 'string', desc: 'A link to another entry. Returns the entry id, or a nested entry when expanded with include.' },
        ]}
      />

      <H2>Field options</H2>
      <ParamTable
        rows={[
          { name: 'required', type: 'boolean', desc: 'Entry cannot be published without a value.' },
          { name: 'unique', type: 'boolean', desc: 'Value must be unique among entries of this type (e.g. a SKU).' },
          { name: 'multiple', type: 'boolean', desc: 'Allow an array of values. Applies to media, reference, and select.' },
          { name: 'options', type: 'string[]', desc: 'Allowed values for a select field.' },
          { name: 'refTypeId', type: 'string', desc: 'Target content type for a reference field.' },
        ]}
      />

      <H2>Example</H2>
      <P>A product type modeled with the fields above:</P>
      <CodeBlock
        lang="json"
        code={`{
  "name": "Product",
  "apiId": "product",
  "fields": [
    { "key": "name", "label": "Name", "type": "text", "required": true },
    { "key": "price", "label": "Price", "type": "number", "required": true },
    { "key": "description", "label": "Description", "type": "richtext" },
    { "key": "image", "label": "Image", "type": "media" },
    { "key": "gallery", "label": "Gallery", "type": "media", "multiple": true },
    { "key": "category", "label": "Category", "type": "select",
      "options": ["shoes", "apparel", "accessories"] },
    { "key": "featured", "label": "Featured", "type": "boolean" }
  ]
}`}
      />

      <H2>Modeling tips</H2>
      <P>
        Keep types flat and render-friendly: put everything a page needs into
        fields so a single fetch is enough. Use <InlineCode>select</InlineCode> for
        fixed taxonomy and <InlineCode>reference</InlineCode> for relations (an
        author, a category with its own image and description). Use{' '}
        <InlineCode>richtext</InlineCode> only for long-form content with
        formatting; reach for <InlineCode>text</InlineCode> for short blurbs. Every
        entry already has a system <InlineCode>slug</InlineCode> for routing — you
        rarely need a separate field for it.
      </P>

      <NextLink href="/docs/delivery-api" title="Delivery API" />
    </article>
  );
}
