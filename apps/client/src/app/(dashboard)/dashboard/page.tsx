import { ProjectsOverview } from '@/components/workspace/projects-overview';

/** /dashboard — the home. Shows the default workspace's projects (the active
 *  workspace is resolved implicitly; switching workspace navigates to /w/[ws]). */
export default function DashboardPage() {
  return <ProjectsOverview />;
}
