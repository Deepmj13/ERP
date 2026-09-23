import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';

export interface CreateVendorInput {
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  currency?: string;
  paymentTerms?: string;
  address?: Record<string, unknown>;
}

export interface UpdateVendorInput {
  code?: string;
  name?: string;
  email?: string;
  phone?: string;
  taxId?: string;
  currency?: string;
  paymentTerms?: string;
  address?: Record<string, unknown>;
  isActive?: boolean;
}

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q?: string, isActive?: string) {
    return this.prisma.vendor.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
        ...(isActive ? { isActive: isActive === 'true' } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found in this workspace');
    return vendor;
  }

  async create(user: AuthUser, input: CreateVendorInput) {
    if (!input.name?.trim()) throw new BadRequestException('Vendor name is required');

    const vendor = await this.prisma.vendor.create({
      data: {
        tenantId: user.tenantId,
        code: input.code?.trim() || undefined,
        name: input.name.trim(),
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        taxId: input.taxId ?? undefined,
        currency: input.currency || 'USD',
        paymentTerms: input.paymentTerms ?? undefined,
        address: (input.address as never) ?? undefined,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'vendor.create',
      entityType: 'vendor',
      entityId: vendor.id,
      newValues: input,
    });
    return vendor;
  }

  async update(user: AuthUser, id: string, input: UpdateVendorInput) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found in this workspace');

    const updated = await this.prisma.vendor.update({
      where: { id },
      data: {
        code: input.code === undefined ? undefined : input.code.trim(),
        name: input.name?.trim() || undefined,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        taxId: input.taxId ?? undefined,
        currency: input.currency ?? undefined,
        paymentTerms: input.paymentTerms ?? undefined,
        address: (input.address as never) ?? undefined,
        isActive: input.isActive,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'vendor.update',
      entityType: 'vendor',
      entityId: id,
      oldValues: vendor,
      newValues: input,
    });
    return updated;
  }
}