import { Suspense } from 'react';
import { ProjectsOverview } from '@/components/workspace/projects-overview';
import { ProjectsOverviewSkeleton } from '@/components/skeleton/projects-overview-skeleton';

/** Workspace overview — the workspace's projects grid. */
export default function WorkspaceOverviewPage() {
  return (
    <Suspense fallback={<ProjectsOverviewSkeleton />}>
      <ProjectsOverview />
    </Suspense>
  );
}
