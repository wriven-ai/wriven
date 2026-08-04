import {
  Callout,
  DocTitle,
  H2,
  InlineCode,
  Lead,
  NextLink,
  P,
} from '../../../components/docs/prose';

export const metadata = { title: 'Rate Limits & Usage · Wriven Docs' };

export default function RateLimitsPage() {
  return (
    <article>
      <DocTitle>Rate Limits &amp; Usage</DocTitle>
      <Lead>
        Delivery API consumption is metered per workspace. Each plan sets a monthly
        request allowance and storage cap; you can track both from the dashboard.
      </Lead>

      <H2>What is metered</H2>
      <P>
        One Delivery API request authenticated with a{' '}
        <InlineCode>wrk_…</InlineCode> key counts as one unit against your
        workspace’s monthly request allowance. The count happens once per HTTP
        request, on success, and is scoped to the workspace — not per project or
        per key.
      </P>

      <H2>Storage</H2>
      <P>
        Storage is the live sum of media bytes across all projects in the
        workspace. Asset bandwidth is a plan dimension but is not yet measured —
        media is served as object keys, so real egress lives on the CDN.
      </P>

      <H2>When you exceed the limit</H2>
      <P>
        Overages are soft and fail-open by default. When usage enforcement is
        enabled and your request count reaches the monthly limit, the Delivery API
        returns <InlineCode>429 RATE_LIMITED</InlineCode>; otherwise metering never
        blocks delivery.
      </P>
      <Callout type="info" title="// ENFORCEMENT IS OFF BY DEFAULT">
        Metering always runs, but it does not block requests unless enforcement is
        switched on. You will see usage climb in the dashboard before anything
        stops serving.
      </Callout>

      <H2>Monitoring usage</H2>
      <P>
        The Usage page in the dashboard shows the current billing period (calendar
        month, UTC boundaries), requests used vs. limit, and storage used vs.
        limit. The counter is batched off the hot path and flushed roughly every
        15 seconds, so the number you see may lag real-time by a short window.
      </P>
      <P>
        To stay well under your allowance, cache aggressively — the Delivery API
        ships cache headers and tags for exactly this (see Caching), and any CDN
        or framework cache in front of it absorbs repeat reads.
      </P>

      <NextLink href="/docs/caching" title="Caching" />
    </article>
  );
}
