import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';

export interface CreateCustomerInput {
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  taxId?: string;
  currency?: string;
  address?: Record<string, unknown>;
  notes?: string;
}

export interface UpdateCustomerInput {
  code?: string;
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  taxId?: string;
  currency?: string;
  address?: Record<string, unknown>;
  notes?: string;
  isActive?: boolean;
}

export interface CreateContactInput {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
}

export interface UpdateContactInput {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q?: string) {
    return this.prisma.customer.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { contacts: { orderBy: { isPrimary: 'desc' } } },
    });
    if (!customer) throw new NotFoundException('Customer not found in this workspace');
    return customer;
  }

  async create(user: AuthUser, input: CreateCustomerInput) {
    if (!input.name.trim()) throw new BadRequestException('Customer name is required');

    const customer = await this.prisma.customer.create({
      data: {
        tenantId: user.tenantId,
        code: input.code?.trim() || undefined,
        name: input.name.trim(),
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        website: input.website ?? undefined,
        taxId: input.taxId ?? undefined,
        currency: input.currency || 'USD',
        address: (input.address as never) ?? undefined,
        notes: input.notes ?? undefined,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'customer.create',
      entityType: 'customer',
      entityId: customer.id,
      newValues: input,
    });
    return customer;
  }

  async update(user: AuthUser, id: string, input: UpdateCustomerInput) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found in this workspace');

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        code: input.code === undefined ? undefined : input.code.trim(),
        name: input.name?.trim() || undefined,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        website: input.website ?? undefined,
        taxId: input.taxId ?? undefined,
        currency: input.currency ?? undefined,
        address: (input.address as never) ?? undefined,
        notes: input.notes ?? undefined,
        isActive: input.isActive,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'customer.update',
      entityType: 'customer',
      entityId: id,
      oldValues: customer,
      newValues: input,
    });
    return updated;
  }

  async contacts(user: AuthUser, customerId: string) {
    await this.assertCustomer(user, customerId);
    return this.prisma.customerContact.findMany({
      where: { customerId, tenantId: user.tenantId },
      orderBy: { isPrimary: 'desc' },
    });
  }

  async addContact(user: AuthUser, customerId: string, input: CreateContactInput) {
    await this.assertCustomer(user, customerId);
    if (!input.name.trim()) throw new BadRequestException('Contact name is required');

    if (input.isPrimary) {
      await this.prisma.customerContact.updateMany({
        where: { customerId, tenantId: user.tenantId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await this.prisma.customerContact.create({
      data: {
        tenantId: user.tenantId,
        customerId,
        name: input.name.trim(),
        title: input.title ?? undefined,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        isPrimary: input.isPrimary ?? false,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'customer_contact.create',
      entityType: 'customer_contact',
      entityId: contact.id,
      newValues: input,
    });
    return contact;
  }

  async updateContact(user: AuthUser, id: string, input: UpdateContactInput) {
    const contact = await this.prisma.customerContact.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!contact) throw new NotFoundException('Contact not found in this workspace');

    if (input.isPrimary) {
      await this.prisma.customerContact.updateMany({
        where: { customerId: contact.customerId, tenantId: user.tenantId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const updated = await this.prisma.customerContact.update({
      where: { id },
      data: {
        name: input.name?.trim() || undefined,
        title: input.title ?? undefined,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        isPrimary: input.isPrimary,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'customer_contact.update',
      entityType: 'customer_contact',
      entityId: id,
      oldValues: contact,
      newValues: input,
    });
    return updated;
  }

  private async assertCustomer(user: AuthUser, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: user.tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found in this workspace');
  }
}
