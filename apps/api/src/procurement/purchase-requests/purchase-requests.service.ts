import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@erp/database';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import { DocumentNumberingService } from '../../common/database/document-numbering.service';
import { ApprovalsService } from '../../ops/approvals/approvals.service';

export interface PurchaseRequestItemInput {
  productId?: string;
  description: string;
  quantity: number;
  unitId?: string;
  expectedDate?: string;
  sortOrder?: number;
}

export interface CreatePurchaseRequestInput {
  requestedDate?: string;
  notes?: string;
  items: PurchaseRequestItemInput[];
}

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: DocumentNumberingService,
    private readonly approvals: ApprovalsService,
  ) {}

  async list(user: AuthUser, q?: string, status?: string) {
    return this.prisma.purchaseRequest.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status ? { status } : {}),
      },
      include: {
        items: true,
        orders: { select: { id: true, number: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const doc = await this.prisma.purchaseRequest.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: { orderBy: { sortOrder: 'asc' } }, orders: true },
    });
    if (!doc) throw new NotFoundException('Purchase request not found');
    return doc;
  }

  async create(user: AuthUser, input: CreatePurchaseRequestInput) {
    if (!input.items?.length) throw new BadRequestException('At least one item is required');
    const doc = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.purchaseRequest.create({
        data: {
          tenantId: user.tenantId,
          status: 'DRAFT',
          requestedDate: input.requestedDate ? new Date(input.requestedDate) : undefined,
          notes: input.notes,
          createdById: user.userId,
          items: {
            create: input.items.map((item, i) => ({
              tenantId: user.tenantId,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitId: item.unitId,
              expectedDate: item.expectedDate ? new Date(item.expectedDate) : undefined,
              sortOrder: item.sortOrder ?? i,
            })),
          },
        },
        include: { items: true },
      });
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'purchase_request.create',
      entityType: 'purchase_request',
      entityId: doc.id,
      newValues: input,
    });
    return this.get(user, doc.id);
  }

  async submit(user: AuthUser, id: string) {
    const doc = await this.transition(user, id, 'DRAFT', 'SUBMITTED');
    await this.approvals.recordSubmit(user, 'PURCHASE_REQUEST', id);
    return doc;
  }

  async approve(user: AuthUser, id: string) {
    let approvedNumber: string | undefined;
    await this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.purchaseRequest.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!doc) throw new NotFoundException('Purchase request not found');
      if (doc.status !== 'SUBMITTED')
        throw new BadRequestException(`Invalid transition: ${doc.status} → APPROVED`);
      const number = await this.numbering.allocateNumber(user.tenantId, 'PR', { prefix: 'PR-' }, tx as never);
      approvedNumber = number.number;
      await tx.purchaseRequest.update({
        where: { id },
        data: { status: 'APPROVED', number: number.number, approvedById: user.userId, approvedAt: new Date() },
      });
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'purchase_request.approve',
      entityType: 'purchase_request',
      entityId: id,
      newValues: { number: approvedNumber },
    });
    await this.approvals.recordDecision(user, 'PURCHASE_REQUEST', id, approvedNumber, 'APPROVED');
    return this.get(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const doc = await this.prisma.purchaseRequest.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!doc) throw new NotFoundException('Purchase request not found');
    if (!['DRAFT', 'SUBMITTED'].includes(doc.status))
      throw new BadRequestException('Cannot cancel purchase request in current status');
    return this.prisma.purchaseRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  private async transition(user: AuthUser, id: string, from: string, to: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const doc = await tx.purchaseRequest.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!doc) throw new NotFoundException('Purchase request not found');
      if (doc.status !== from) throw new BadRequestException(`Invalid transition: ${doc.status} → ${to} (expected ${from})`);
      return tx.purchaseRequest.update({ where: { id }, data: { status: to } });
    });
  }
}