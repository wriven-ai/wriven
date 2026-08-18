import { NextResponse } from 'next/server';
import { z } from 'zod';

const CONTACT_TO = process.env.CONTACT_TO ?? 'hello@wriven.tech';
const CONTACT_FROM = process.env.CONTACT_FROM ?? 'Wriven Website <hello@wriven.tech>';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(5000),
  company: z.string().max(0).optional(), // honeypot — humans never fill this
});

// Per-instance rate limit: 5 submissions per hour per IP.
// Resets with each cold start; adequate for a single-region contact form.
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 5;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { success: false, error: 'Too many messages. Try again later.' },
      { status: 429 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid request.' },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Name, email, and message are required.' },
      { status: 422 },
    );
  }

  // Honeypot tripped → pretend success so bots don't retry with variations.
  if (parsed.data.company !== undefined && parsed.data.company !== '') {
    return NextResponse.json({ success: true });
  }

  const { name, email, subject, message } = parsed.data;
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    '',
    message,
  ].join('\n');

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('contact route: RESEND_API_KEY is not set');
    return NextResponse.json(
      { success: false, error: 'Message delivery is not configured.' },
      { status: 500 },
    );
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: CONTACT_FROM,
        to: CONTACT_TO,
        reply_to: email,
        subject: `[Website] ${subject} — ${name}`,
        text,
      }),
    });

    if (!res.ok) {
      console.error(`contact route: Resend responded ${res.status}`);
      return NextResponse.json(
        { success: false, error: 'Could not deliver your message. Please email us directly.' },
        { status: 502 },
      );
    }
  } catch {
    console.error('contact route: Resend request failed');
    return NextResponse.json(
      { success: false, error: 'Could not deliver your message. Please email us directly.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
