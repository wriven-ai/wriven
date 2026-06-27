import { Callout, DocTitle, H2, InlineCode, Lead, NextLink, P } from '../../components/docs/prose';

export const metadata = { title: 'Introduction · Wriven Docs' };

export default function DocsIntroPage() {
  return (
    <article>
      <DocTitle>Introduction</DocTitle>
      <Lead>
        Wriven is a headless, AI-native CMS. You model and write content in the
        dashboard; your website or app pulls it over HTTPS through the Content
        Delivery API. Wriven never renders your front end — you stay in full
        control of your stack.
      </Lead>

      <H2>The model</H2>
      <P>
        Content is organized in a simple hierarchy. A{' '}
        <InlineCode>Workspace</InlineCode> holds your team and billing. Inside it,
        a <InlineCode>Project</InlineCode> holds all content for one site or app.
        Within a project you define <InlineCode>Content Types</InlineCode> (the
        shape of your data — e.g. <InlineCode>blog_post</InlineCode> with title,
        body, cover) and create <InlineCode>Entries</InlineCode> of those types.
      </P>
      <P>
        Each entry has a status: <InlineCode>draft</InlineCode>,{' '}
        <InlineCode>published</InlineCode>, or <InlineCode>archived</InlineCode>.
        The Delivery API returns published content to your live site; preview
        keys can additionally read drafts.
      </P>

      <H2>How your site connects</H2>
      <P>
        You create a project-scoped <strong>API key</strong> in the dashboard and
        call the Delivery API with it. No SDK or install is required — any HTTP
        client works (fetch, curl, mobile, server).
      </P>

      <Callout type="info" title="// THREE STEPS">
        Define a content type → publish an entry → create a read key and fetch.
        The Quickstart walks through all three.
      </Callout>

      <NextLink href="/docs/quickstart" title="Quickstart" />
    </article>
  );
}
