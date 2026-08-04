'use client';

import { useParams } from 'next/navigation';
import { ContentEditor } from '@/components/content/content-editor';

export default function EditEntryPage() {
  const { entryId } = useParams<{ entryId: string }>();
  return <ContentEditor entryId={entryId} />;
}
