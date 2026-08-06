'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import type { NavItem, NavLeaf, NavTree } from './nav.types';

/**
 * The one active-state rule: explicit override wins, else parents match by
 * prefix and leaves by exact. Keeping this central is what prevents two rows
 * lighting up at once.
 */
function isActive(
  node: { href: string; active?: boolean; match?: 'exact' | 'prefix' },
  pathname: string,
): boolean {
  if (node.active !== undefined) return node.active;
  if (!node.href) return false;
  return node.match === 'exact'
    ? pathname === node.href
    : pathname.startsWith(node.href);
}

/** Dumb renderer: walks a NavTree and maps each node to a shell primitive.
 *  No domain knowledge, no access checks, no URL parsing beyond active-state. */
export function NavTreeRenderer({ tree }: { tree: NavTree }) {
  const pathname = usePathname();

  return (
    <>
      {tree.map((group, gi) => (
        <SidebarGroup key={group.groupLabel || gi}>
          {group.groupLabel ? (
            <SidebarGroupLabel className="font-mono text-sm tracking-widest uppercase">
              {group.groupLabel}
            </SidebarGroupLabel>
          ) : null}
          <SidebarMenu>
            {group.items.map((item) => (
              <NavItemNode
                key={item.label}
                item={item}
                pathname={pathname}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}

function NavItemNode({ item, pathname }: { item: NavItem; pathname: string }) {
  const hasSub = !!item.submenus && item.submenus.length > 0;
  return hasSub ? (
    <CollapsibleItem item={item} pathname={pathname} />
  ) : (
    <FlatItem item={item} pathname={pathname} />
  );
}

function FlatItem({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive(item, pathname)}
        tooltip={item.label}
        render={<Link href={item.href} />}
        className="font-mono text-sm"
      >
        {Icon ? <Icon /> : null}
        <span>{item.label}</span>
      </SidebarMenuButton>
      {item.badge != null ? (
        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
}

function CollapsibleItem({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const submenus = item.submenus ?? [];
  const leaves = submenus.flatMap((g) => g.items);
  const childActive = leaves.some((l) => isActive(l, pathname));
  const [open, setOpen] = useState(item.defaultOpen || childActive);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              isActive={childActive}
              tooltip={item.label}
              className="font-mono text-sm"
            >
              {Icon ? <Icon /> : null}
              <span>{item.label}</span>
              <ChevronRight
                className={cn(
                  'ml-auto transition-transform duration-200',
                  open && 'rotate-90',
                )}
              />
            </SidebarMenuButton>
          }
        />
        <CollapsibleContent>
          <SidebarMenuSub>
            {submenus.map((sub) => (
              <SubGroup
                key={sub.groupLabel}
                groupLabel={sub.groupLabel}
                items={sub.items}
                pathname={pathname}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SubGroup({
  groupLabel,
  items,
  pathname,
}: {
  groupLabel: string;
  items: NavLeaf[];
  pathname: string;
}) {
  return (
    <>
      {groupLabel ? (
        <li className="px-2 pt-1.5 pb-0.5 font-mono text-sm tracking-widest text-sidebar-foreground/50 uppercase">
          {groupLabel}
        </li>
      ) : null}
      {items.map((leaf) => {
        const Icon = leaf.icon;
        return (
          <SidebarMenuSubItem key={leaf.label}>
            <SidebarMenuSubButton
              isActive={isActive(leaf, pathname)}
              render={<Link href={leaf.href} />}
              className="font-mono text-sm"
            >
              {Icon ? <Icon /> : null}
              <span>{leaf.label}</span>
            </SidebarMenuSubButton>
            {leaf.badge != null ? (
              <SidebarMenuBadge>{leaf.badge}</SidebarMenuBadge>
            ) : null}
          </SidebarMenuSubItem>
        );
      })}
    </>
  );
}
