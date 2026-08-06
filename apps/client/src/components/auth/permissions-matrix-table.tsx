'use client';

import React from 'react';
import { Check, X, Shield, Sparkles } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Permission,
  WORKSPACE_ROLE_PERMISSIONS,
  PROJECT_ROLE_PERMISSIONS,
  WorkspaceRole,
  ProjectRole,
} from '@wriven/contracts/rbac';

interface PermissionRow {
  key: Permission;
  label: string;
  description: string;
  category: string;
}

const WORKSPACE_PERMISSION_ROWS: PermissionRow[] = [
  {
    category: 'Workspace Management',
    key: Permission.WORKSPACE_VIEW,
    label: 'View Workspace',
    description: 'Access the workspace overview and navigation',
  },
  {
    category: 'Workspace Management',
    key: Permission.WORKSPACE_EDIT,
    label: 'Edit Workspace Settings',
    description: 'Update workspace name, avatar, and settings',
  },
  {
    category: 'Workspace Management',
    key: Permission.WORKSPACE_DELETE,
    label: 'Delete Workspace',
    description: 'Permanently delete the workspace and all its data',
  },
  {
    category: 'Members & Roles',
    key: Permission.WORKSPACE_MEMBERS_VIEW,
    label: 'View Members',
    description: 'See list of workspace members and pending invitations',
  },
  {
    category: 'Members & Roles',
    key: Permission.WORKSPACE_MEMBERS_MANAGE,
    label: 'Manage Members & Invites',
    description: 'Invite new members, change roles (non-owner), and remove members',
  },
  {
    category: 'Members & Roles',
    key: Permission.WORKSPACE_ROLE_ASSIGN,
    label: 'Transfer / Assign Owner',
    description: 'Grant or transfer the Workspace Owner role',
  },
  {
    category: 'Projects & Resources',
    key: Permission.WORKSPACE_PROJECT_CREATE,
    label: 'Create Projects',
    description: 'Create new CMS projects within the workspace',
  },
  {
    category: 'Projects & Resources',
    key: Permission.PROJECT_VIEW_ALL,
    label: 'See All Projects',
    description: 'View all projects in the workspace, even if not explicitly assigned',
  },
  {
    category: 'Projects & Resources',
    key: Permission.PROJECT_VIEW_ASSIGNED,
    label: 'See Assigned Projects',
    description: 'View only projects where explicitly added as a member',
  },
  {
    category: 'Billing & Usage',
    key: Permission.WORKSPACE_BILLING_MANAGE,
    label: 'Manage Billing',
    description: 'Subscribe, update payment methods, manage plan tiers and invoices',
  },
  {
    category: 'Billing & Usage',
    key: Permission.WORKSPACE_USAGE_VIEW,
    label: 'View Usage & Analytics',
    description: 'Monitor quota usage, API request stats, and storage consumption',
  },
];

const PROJECT_PERMISSION_ROWS: PermissionRow[] = [
  {
    category: 'Project Settings',
    key: Permission.PROJECT_VIEW,
    label: 'View Project',
    description: 'Access the project dashboard and view content',
  },
  {
    category: 'Project Settings',
    key: Permission.PROJECT_EDIT,
    label: 'Edit Project Settings',
    description: 'Update project name, slug, and general configuration',
  },
  {
    category: 'Project Settings',
    key: Permission.PROJECT_DELETE,
    label: 'Delete Project',
    description: 'Soft-delete or permanently destroy the project',
  },
  {
    category: 'Project Members',
    key: Permission.PROJECT_MEMBERS_VIEW,
    label: 'View Project Members',
    description: 'See the list of assigned project members',
  },
  {
    category: 'Project Members',
    key: Permission.PROJECT_MEMBERS_MANAGE,
    label: 'Manage Members',
    description: 'Add, update roles, or remove project members',
  },
  {
    category: 'Project Members',
    key: Permission.PROJECT_ROLE_ASSIGN,
    label: 'Assign Admin Role',
    description: 'Grant or demote the Project Admin role',
  },
  {
    category: 'Content Schema & Entries',
    key: Permission.CONTENT_TYPE_MANAGE,
    label: 'Manage Content Types',
    description: 'Create, modify, and delete content type definitions and fields',
  },
  {
    category: 'Content Schema & Entries',
    key: Permission.CONTENT_ENTRY_CREATE,
    label: 'Create Entries',
    description: 'Create new content entry drafts',
  },
  {
    category: 'Content Schema & Entries',
    key: Permission.CONTENT_ENTRY_UPDATE,
    label: 'Update Entries',
    description: 'Edit existing content entries and draft changes',
  },
  {
    category: 'Content Schema & Entries',
    key: Permission.CONTENT_ENTRY_PUBLISH,
    label: 'Publish / Unpublish Content',
    description: 'Publish entry drafts to the Delivery API or unpublish live entries',
  },
  {
    category: 'Content Schema & Entries',
    key: Permission.CONTENT_ENTRY_DELETE,
    label: 'Delete Entries',
    description: 'Permanently remove content entries',
  },
  {
    category: 'Assets & Developers',
    key: Permission.MEDIA_MANAGE,
    label: 'Manage Media Library',
    description: 'Upload, edit metadata, and delete media assets',
  },
  {
    category: 'Assets & Developers',
    key: Permission.WEBHOOK_MANAGE,
    label: 'Manage Webhooks',
    description: 'Configure event webhooks and HMAC signing secrets',
  },
  {
    category: 'Assets & Developers',
    key: Permission.API_KEY_MANAGE,
    label: 'Manage API Keys',
    description: 'Create, inspect, and revoke API Delivery keys',
  },
];

const WORKSPACE_ROLES_LIST: { role: WorkspaceRole; label: string; badgeClass: string }[] = [
  { role: 'owner', label: 'Owner', badgeClass: 'bg-brand-accent/15 text-brand-accent border-brand-accent/30' },
  { role: 'admin', label: 'Admin', badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  { role: 'member', label: 'Member', badgeClass: 'bg-brand-surface text-text-secondary border-brand-border' },
  { role: 'guest', label: 'Guest', badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
];

const PROJECT_ROLES_LIST: { role: ProjectRole; label: string; badgeClass: string }[] = [
  { role: 'admin', label: 'Admin', badgeClass: 'bg-brand-accent/15 text-brand-accent border-brand-accent/30' },
  { role: 'editor', label: 'Editor', badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  { role: 'viewer', label: 'Viewer', badgeClass: 'bg-brand-surface text-text-secondary border-brand-border' },
];

export function WorkspacePermissionsTable() {
  const categories = Array.from(new Set(WORKSPACE_PERMISSION_ROWS.map((r) => r.category)));

  return (
    <div className="space-y-4">
      {/* Information Banner */}
      <div className="flex items-start gap-3 p-3.5 border border-brand-border bg-brand-surface-soft/60 rounded-xl text-sm font-mono text-text-secondary leading-relaxed">
        <Shield className="w-4 h-4 text-brand-accent shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-text-primary">Workspace Level RBAC:</span> Controls broad access to workspace settings, billing, project creation, and team management.
          <p className="mt-1 text-sm text-text-muted">
            <span className="font-semibold text-brand-accent">Cascade Note:</span> Workspace Owners and Admins automatically inherit full access to all projects in the workspace.
          </p>
        </div>
      </div>

      <div className="border border-brand-border bg-brand-surface rounded-xl overflow-hidden shadow-xs">
        <Table>
          <TableHeader className="bg-brand-surface-soft/40 border-b border-brand-border">
            <TableRow>
              <TableHead className="w-[45%] font-mono text-sm font-bold text-text-primary py-3">Permission / Action</TableHead>
              {WORKSPACE_ROLES_LIST.map(({ role, label, badgeClass }) => (
                <TableHead key={role} className="text-center font-mono text-sm py-3 w-[13.75%]">
                  <span className={`px-2 py-0.5 rounded text-sm font-semibold uppercase border ${badgeClass}`}>
                    {label}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => {
              const rows = WORKSPACE_PERMISSION_ROWS.filter((r) => r.category === cat);
              return (
                <React.Fragment key={cat}>
                  {/* Category Header Row */}
                  <TableRow className="bg-brand-surface-soft/20 border-b border-brand-border">
                    <TableCell colSpan={5} className="py-2 px-3 font-mono text-sm font-bold text-brand-secondary uppercase tracking-wider">
                      {cat}
                    </TableCell>
                  </TableRow>
                  {rows.map((row) => (
                    <TableRow key={row.key} className="border-b border-brand-border/60 hover:bg-brand-surface-soft/30 transition-colors">
                      <TableCell className="py-2.5 px-3">
                        <div className="font-mono text-sm font-bold text-text-primary">{row.label}</div>
                        <div className="font-mono text-sm text-text-muted leading-tight mt-0.5">{row.description}</div>
                      </TableCell>
                      {WORKSPACE_ROLES_LIST.map(({ role }) => {
                        const hasPerm = WORKSPACE_ROLE_PERMISSIONS[role].has(row.key);
                        return (
                          <TableCell key={role} className="text-center py-2.5">
                            {hasPerm ? (
                              <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-status-success/15 text-status-success mx-auto">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-surface-soft/80 text-text-muted/40 mx-auto">
                                <X className="w-3 h-3 stroke-[2]" />
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function ProjectPermissionsTable() {
  const categories = Array.from(new Set(PROJECT_PERMISSION_ROWS.map((r) => r.category)));

  return (
    <div className="space-y-4">
      {/* Information Banner */}
      <div className="flex items-start gap-3 p-3.5 border border-brand-border bg-brand-surface-soft/60 rounded-xl text-sm font-mono text-text-secondary leading-relaxed">
        <Sparkles className="w-4 h-4 text-brand-secondary shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-text-primary">Project Level RBAC:</span> Fine-grained control over content types, entries, publishing workflows, media assets, API keys, and webhooks.
          <p className="mt-1 text-sm text-text-muted">
            Editors can draft and edit entries, but only Project Admins (and Workspace Owners/Admins) can publish content or alter schemas.
          </p>
        </div>
      </div>

      <div className="border border-brand-border bg-brand-surface rounded-xl overflow-hidden shadow-xs">
        <Table>
          <TableHeader className="bg-brand-surface-soft/40 border-b border-brand-border">
            <TableRow>
              <TableHead className="w-[52%] font-mono text-sm font-bold text-text-primary py-3">Permission / Action</TableHead>
              {PROJECT_ROLES_LIST.map(({ role, label, badgeClass }) => (
                <TableHead key={role} className="text-center font-mono text-sm py-3 w-[16%]">
                  <span className={`px-2 py-0.5 rounded text-sm font-semibold uppercase border ${badgeClass}`}>
                    {label}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((cat) => {
              const rows = PROJECT_PERMISSION_ROWS.filter((r) => r.category === cat);
              return (
                <React.Fragment key={cat}>
                  {/* Category Header Row */}
                  <TableRow className="bg-brand-surface-soft/20 border-b border-brand-border">
                    <TableCell colSpan={4} className="py-2 px-3 font-mono text-sm font-bold text-brand-secondary uppercase tracking-wider">
                      {cat}
                    </TableCell>
                  </TableRow>
                  {rows.map((row) => (
                    <TableRow key={row.key} className="border-b border-brand-border/60 hover:bg-brand-surface-soft/30 transition-colors">
                      <TableCell className="py-2.5 px-3">
                        <div className="font-mono text-sm font-bold text-text-primary">{row.label}</div>
                        <div className="font-mono text-sm text-text-muted leading-tight mt-0.5">{row.description}</div>
                      </TableCell>
                      {PROJECT_ROLES_LIST.map(({ role }) => {
                        const hasPerm = PROJECT_ROLE_PERMISSIONS[role].has(row.key);
                        return (
                          <TableCell key={role} className="text-center py-2.5">
                            {hasPerm ? (
                              <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-status-success/15 text-status-success mx-auto">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-surface-soft/80 text-text-muted/40 mx-auto">
                                <X className="w-3 h-3 stroke-[2]" />
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
