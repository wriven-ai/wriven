'use client';

import React from 'react';
import { RequireAuth } from '../../components/auth/RequireAuth';
import { AppSidebar } from '@/components/sidebar/app-sidebar';
import { DashboardNavbar } from '@/components/topbar/dashboard-navbar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-brand-bg editorial-grid paper-grain">
          <DashboardNavbar />
          <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto select-none">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </RequireAuth>
  );
}
