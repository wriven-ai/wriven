'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ContentEditor } from '@/components/content/content-editor';

function NewEntryInner() {
  const params = useSearchParams();
  const typeId = params.get('type') ?? undefined;
  return <ContentEditor typeId={typeId} />;
}

export default function NewEntryPage() {
  return (
    <Suspense fallback={null}>
      <NewEntryInner />
    </Suspense>
  );
}
