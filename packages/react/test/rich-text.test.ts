import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WrivenRichText } from '../src/index';

/** Walk a React element tree collecting nodes whose `type` matches a tag. */
function findByType(node: unknown, type: string, acc: any[] = []): any[] {
  if (node == null || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const n of node) findByType(n, type, acc);
    return acc;
  }
  const el = node as { type?: unknown; props?: { children?: unknown } };
  if (el.type === type) acc.push(el);
  const kids = el.props?.children;
  if (kids != null) findByType(Array.isArray(kids) ? kids : [kids], type, acc);
  return acc;
}

const linkDoc = (href: string) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }] },
  ],
});

test('sanitizes a javascript: href to #', () => {
  const links = findByType(WrivenRichText({ value: linkDoc('javascript:alert(1)') }), 'a');
  assert.equal(links.length, 1);
  assert.equal(links[0].props.href, '#');
});

test('keeps an https href', () => {
  const links = findByType(WrivenRichText({ value: linkDoc('https://example.com') }), 'a');
  assert.equal(links[0].props.href, 'https://example.com');
});

test('renders an image node with the resolved src', () => {
  const doc = {
    type: 'doc',
    content: [{ type: 'image', attrs: { src: 'https://cdn/x.png', alt: 'a', width: 10, height: 5 } }],
  };
  const imgs = findByType(WrivenRichText({ value: doc }), 'img');
  assert.equal(imgs[0].props.src, 'https://cdn/x.png');
  assert.equal(imgs[0].props.alt, 'a');
});

test('returns null for an empty value', () => {
  assert.equal(WrivenRichText({ value: null }), null);
});
