import { Suspense } from 'react';
import { ProjectsOverview } from '@/components/workspace/projects-overview';
import { ProjectsOverviewSkeleton } from '@/components/skeleton/projects-overview-skeleton';

/** /dashboard — the home. Shows the default workspace's projects (the active
 *  workspace is resolved implicitly; switching workspace navigates to /w/[ws]). */
export default function DashboardPage() {
  return (
    <Suspense fallback={<ProjectsOverviewSkeleton />}>
      <ProjectsOverview />
    </Suspense>
  );
}
