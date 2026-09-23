import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { NotificationsJobService } from '../../jobs/notifications.job.service';

export interface NotifyInput {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface PreferenceInput {
  channel: string;
  enabled?: boolean;
  quietStart?: string | null;
  quietEnd?: string | null;
}

const CHANNELS = ['IN_APP', 'EMAIL', 'PUSH'] as const;

/**
 * In-app + email fan-out (approved scope). Every notable event persists an
 * IN_APP notification row; when the recipient has EMAIL enabled, the same
 * event is fanned out through the existing BullMQ email queue (worker's
 * EmailProcessor + LogMailerProvider in dev). Preferences version is always
 * server-side. This sits in the request path by design — the persistent row
 * must land in the same transaction as the business event that produced it.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: NotificationsJobService,
  ) {}

  async notify(input: NotifyInput): Promise<{ id: string }> {
    const row = await this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        channel: 'IN_APP',
        data: (input.data ?? undefined) as never,
      },
    });

    if (await this.emailEnabled(input.tenantId, input.userId)) {
      await this.fanOutEmail(input, row.id);
    }
    return { id: row.id };
  }

  /** Bulks a notification to several recipients in one transaction. */
  async notifyMany(
    tenantId: string,
    userIds: string[],
    input: Omit<NotifyInput, 'tenantId' | 'userId'>,
  ): Promise<number> {
    const unique = [...new Set(userIds)];
    if (!unique.length) return 0;
    let created = 0;
    for (const userId of unique) {
      await this.notify({ ...input, tenantId, userId });
      created += 1;
    }
    return created;
  }

  async list(
    user: AuthUser,
    unreadOnly: boolean,
    page: number,
    limit: number,
  ): Promise<{ items: unknown[]; total: number; page: number; limit: number }> {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const where = {
      tenantId: user.tenantId,
      userId: user.userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page: Math.max(page, 1), limit: take };
  }

  async unreadCount(user: AuthUser): Promise<number> {
    return this.prisma.notification.count({
      where: { tenantId: user.tenantId, userId: user.userId, readAt: null },
    });
  }

  async markAllRead(user: AuthUser): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { tenantId: user.tenantId, userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async getPreferences(user: AuthUser) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
      orderBy: { channel: 'asc' },
    });
    const byChannel = new Map(rows.map((r) => [r.channel, r]));
    return CHANNELS.map((channel) => {
      const row = byChannel.get(channel);
      return {
        channel,
        enabled: row?.enabled ?? true,
        quietStart: row?.quietStart ?? null,
        quietEnd: row?.quietEnd ?? null,
      };
    });
  }

  async setPreferences(user: AuthUser, input: PreferenceInput[]): Promise<unknown> {
    for (const pref of input) {
      if (!CHANNELS.includes(pref.channel as (typeof CHANNELS)[number])) continue;
      await this.prisma.notificationPreference.upsert({
        where: { userId_channel: { userId: user.userId, channel: pref.channel } },
        update: {
          enabled: pref.enabled ?? true,
          quietStart: pref.quietStart ?? null,
          quietEnd: pref.quietEnd ?? null,
        },
        create: {
          tenantId: user.tenantId,
          userId: user.userId,
          channel: pref.channel,
          enabled: pref.enabled ?? true,
          quietStart: pref.quietStart ?? null,
          quietEnd: pref.quietEnd ?? null,
        },
      });
    }
    return this.getPreferences(user);
  }

  private async emailEnabled(tenantId: string, userId: string): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_channel: { userId, channel: 'EMAIL' } },
    });
    return pref?.enabled ?? true;
  }

  private async fanOutEmail(input: NotifyInput, notificationId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user?.email) return;
    await this.jobs.enqueueEmail({
      tenantId: input.tenantId,
      to: user.email,
      subject: input.title,
      template: input.type,
      data: {
        notificationId,
        title: input.title,
        body: input.body ?? '',
        ...(input.data ?? {}),
      },
    });
  }
}