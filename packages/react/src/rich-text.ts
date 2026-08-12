import { createElement, Fragment } from 'react';
import type { ComponentType, ReactNode } from 'react';

export interface ProseMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface ProseNode {
  type?: string;
  text?: string;
  marks?: ProseMark[];
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
}

/** Override the element rendered for a node type, e.g. { image: MyImage }. */
export type RichTextComponents = Partial<
  Record<string, ComponentType<{ node: ProseNode; children?: ReactNode }>>
>;

const MARK_TAG: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  code: 'code',
};

// Allow only safe link schemes and paths — blocks javascript:/data: XSS from authored hrefs.
const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#|\.{1,2}\/)/i;
function safeHref(href: unknown): string {
  const value = String(href ?? '').trim();
  return SAFE_HREF.test(value) ? value : '#';
}

function renderText(node: ProseNode, key: number): ReactNode {
  let el: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'link') {
      el = createElement(
        'a',
        { key: `m${key}`, href: safeHref(mark.attrs?.href), rel: 'noreferrer noopener' },
        el,
      );
    } else {
      const tag = MARK_TAG[mark.type];
      if (tag) el = createElement(tag, { key: `m${key}` }, el);
    }
  }
  return el;
}

function renderChildren(node: ProseNode, components?: RichTextComponents): ReactNode[] {
  return (node.content ?? []).map((child, i) => renderNode(child, i, components));
}

function renderNode(
  node: ProseNode,
  key: number,
  components?: RichTextComponents,
): ReactNode {
  // Caller-provided override wins for any node type.
  const Override = node.type ? components?.[node.type] : undefined;
  if (Override) {
    return createElement(
      Override,
      { key, node },
      ...renderChildren(node, components),
    );
  }

  switch (node.type) {
    case 'text':
      return renderText(node, key);
    case 'paragraph':
      return createElement('p', { key }, ...renderChildren(node, components));
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2)));
      return createElement(`h${level}`, { key }, ...renderChildren(node, components));
    }
    case 'bulletList':
      return createElement('ul', { key }, ...renderChildren(node, components));
    case 'orderedList':
      return createElement('ol', { key }, ...renderChildren(node, components));
    case 'listItem':
      return createElement('li', { key }, ...renderChildren(node, components));
    case 'blockquote':
      return createElement('blockquote', { key }, ...renderChildren(node, components));
    case 'codeBlock':
      return createElement(
        'pre',
        { key },
        createElement('code', null, ...renderChildren(node, components)),
      );
    case 'horizontalRule':
      return createElement('hr', { key });
    case 'hardBreak':
      return createElement('br', { key });
    case 'image':
      return createElement('img', {
        key,
        src: node.attrs?.src as string | undefined,
        alt: (node.attrs?.alt as string | undefined) ?? '',
        width: node.attrs?.width as number | undefined,
        height: node.attrs?.height as number | undefined,
      });
    case 'doc':
      return createElement(Fragment, { key }, ...renderChildren(node, components));
    default:
      // Unknown node → render its children so content is never dropped.
      return createElement(Fragment, { key }, ...renderChildren(node, components));
  }
}

/**
 * Render a Wriven rich-text value (ProseMirror JSON from a `richtext` field) to
 * React elements. Inline images resolved by the Delivery API render as `<img>`.
 * Pass `components` to override any node type with your own component.
 */
export function WrivenRichText({
  value,
  components,
}: {
  value: unknown;
  components?: RichTextComponents;
}): ReactNode {
  if (!value || typeof value !== 'object') return null;
  return renderNode(value as ProseNode, 0, components);
}
