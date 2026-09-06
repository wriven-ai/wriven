import { ImageResponse } from 'next/og';

export const alt = 'Wriven — AI-Native Headless CMS';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          backgroundColor: '#faf8f5',
          padding: '80px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '14px',
            backgroundColor: '#0b6e4f',
          }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            letterSpacing: 6,
            color: '#0b6e4f',
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 24,
          }}
        >
          AI-Native Headless CMS
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 120,
            fontWeight: 700,
            color: '#080d0a',
            letterSpacing: -4,
            marginBottom: 28,
          }}
        >
          Wriven
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 36,
            color: '#424c46',
            maxWidth: 900,
          }}
        >
          Model your content, draft with AI, publish to any framework.
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            display: 'flex',
            fontSize: 26,
            color: '#0b6e4f',
            fontWeight: 600,
          }}
        >
          www.wriven.tech
        </div>
      </div>
    ),
    { ...size }
  );
}
