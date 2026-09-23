import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';

export interface PermissionGroup {
  group: string;
  codes: string[];
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Static permission catalog (seeded globally) — the client builds role forms. */
  async catalog(_user: AuthUser): Promise<PermissionGroup[]> {
    const rows = await this.prisma.permission.findMany({
      select: { code: true, description: true, group: true },
      orderBy: [{ group: 'asc' }, { code: 'asc' }],
    });
    const grouped = new Map<string, PermissionGroup>();
    for (const row of rows) {
      const entry = grouped.get(row.group) ?? { group: row.group, codes: [] };
      entry.codes.push(row.code);
      grouped.set(row.group, entry);
    }
    return [...grouped.values()].map((g) => ({
      group: g.group,
      codes: g.codes as string[],
    }));
  }
}
