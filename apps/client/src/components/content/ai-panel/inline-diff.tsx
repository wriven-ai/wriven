/** Compact character diff for plain-text generations; richtext remains rendered safely in RichTextPreview. */
export function InlineDiff({ before, after }: { before: string; after: string }) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end += 1;
  }
  const removed = before.slice(start, before.length - end);
  const added = after.slice(start, after.length - end);
  if (!removed && !added) return null;
  return (
    <div className="text-xs font-mono leading-relaxed text-text-secondary bg-brand-surface-soft border border-brand-border rounded-lg p-3 whitespace-pre-wrap">
      <span>{before.slice(0, start)}</span>
      {removed && <del className="bg-status-error/15 text-status-error no-underline">{removed}</del>}
      {added && <ins className="bg-green-500/15 text-green-700 dark:text-green-300 no-underline">{added}</ins>}
      <span>{before.slice(before.length - end)}</span>
    </div>
  );
}
