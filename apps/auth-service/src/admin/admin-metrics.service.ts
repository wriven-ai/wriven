import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, DrizzleDB } from '@wriven/database';
import { count, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema';

const { users, workspaces, projects, workspacePlans } = schema;

export interface AdminAuthMetrics {
  users: { total: number; verified: number };
  workspaces: { total: number };
  projects: { total: number };
  plans: { key: string; name: string; count: number }[];
}

@Injectable()
export class AdminMetricsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB<typeof schema>,
  ) {}

  /** Auth-side platform counts. Core-side content/media metrics merge at gateway. */
  async auth(): Promise<AdminAuthMetrics> {
    const [
      usersTotal,
      usersVerified,
      workspacesTotal,
      projectsTotal,
      planRows,
      assignedRows,
    ] = await Promise.all([
      this.db.$count(users),
      this.db.$count(users, eq(users.emailVerified, true)),
      this.db.$count(workspaces),
      this.db.$count(projects, isNull(projects.deletedAt)),
      this.db.query.plans.findMany({
        columns: { id: true, key: true, name: true },
      }),
      this.db
        .select({ planId: workspacePlans.planId, c: count() })
        .from(workspacePlans)
        .groupBy(workspacePlans.planId),
    ]);

    const assignedByPlan = new Map(assignedRows.map((r) => [r.planId, r.c]));
    const assignedTotal = assignedRows.reduce((sum, r) => sum + r.c, 0);

    const planBreakdown = planRows.map((p) => {
      let n = assignedByPlan.get(p.id) ?? 0;
      // Workspaces with no explicit assignment default to the `free` plan.
      if (p.key === 'free') n += workspacesTotal - assignedTotal;
      return { key: p.key, name: p.name, count: n };
    });

    return {
      users: { total: usersTotal, verified: usersVerified },
      workspaces: { total: workspacesTotal },
      projects: { total: projectsTotal },
      plans: planBreakdown,
    };
  }
}
