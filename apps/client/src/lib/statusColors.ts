type StatusColorMap = Record<string, string>;

type SectionStatusColors = Record<string, StatusColorMap>;

const SUPPORT_STATUS_COLORS: StatusColorMap = {
  open: 'bg-status-warning/15 text-status-warning border-status-warning/30',
  pending: 'bg-brand-surface text-text-secondary border-brand-border',
  resolved: 'bg-status-success/15 text-status-success border-status-success/30',
  closed: 'bg-status-error/15 text-status-error border-status-error/30',
};

export const SECTION_STATUS_COLORS: SectionStatusColors = {
  support: SUPPORT_STATUS_COLORS,
};

export function getStatusColor(section: string, status: string): string {
  const colors = SECTION_STATUS_COLORS[section];
  if (!colors) return '';
  return colors[status] ?? '';
}