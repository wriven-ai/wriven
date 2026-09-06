import type { Metadata } from 'next';
import { DashboardShell } from './dashboard-shell';

// Private, auth-gated area — keep it out of search indexes entirely.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
