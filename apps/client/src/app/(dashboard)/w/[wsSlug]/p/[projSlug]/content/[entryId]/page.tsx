'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { ContentEditor } from '@/components/content/content-editor';
import { ContentEditorSkeleton } from '@/components/skeleton/content-editor-skeleton';

export default function EditEntryPage() {
  const { entryId } = useParams() as { entryId: string };
  return (
    <Suspense fallback={<ContentEditorSkeleton />}>
      <ContentEditor entryId={entryId} />
    </Suspense>
  );
}
