import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';

export interface UpdateCompanyInput {
  legalName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  country?: string;
  currency?: string;
}

export interface CreateBranchInput {
  companyId: string;
  name: string;
  code?: string;
  address?: Record<string, unknown>;
}

export interface UpdateBranchInput {
  name?: string;
  code?: string;
  address?: Record<string, unknown>;
  isActive?: boolean;
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async company(user: AuthUser) {
    const company = await this.prisma.company.findFirst({ where: { tenantId: user.tenantId } });
    if (!company) throw new NotFoundException('Company not configured');
    return company;
  }

  async updateCompany(user: AuthUser, input: UpdateCompanyInput, ip?: string) {
    const company = await this.prisma.company.findFirst({ where: { tenantId: user.tenantId } });
    if (!company) throw new NotFoundException('Company not configured');

    const updated = await this.prisma.company.update({
      where: { id: company.id },
      data: {
        legalName: input.legalName,
        taxId: input.taxId,
        email: input.email,
        phone: input.phone,
        country: input.country,
        currency: input.currency,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'company.update',
      entityType: 'company',
      entityId: company.id,
      oldValues: company,
      newValues: input,
      ipAddress: ip,
    });
    return updated;
  }

  async branches(user: AuthUser) {
    return this.prisma.branch.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createBranch(user: AuthUser, input: CreateBranchInput, ip?: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: input.companyId, tenantId: user.tenantId },
    });
    if (!company) throw new NotFoundException('Company not found in this workspace');
    if (!input.name.trim()) throw new BadRequestException('Branch name is required');

    const branch = await this.prisma.branch.create({
      data: {
        tenantId: user.tenantId,
        companyId: company.id,
        name: input.name.trim(),
        code: input.code ? input.code.trim() : undefined,
        address: (input.address as never) ?? undefined,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'branch.create',
      entityType: 'branch',
      entityId: branch.id,
      newValues: input,
      ipAddress: ip,
    });
    return branch;
  }

  async updateBranch(user: AuthUser, id: string, input: UpdateBranchInput, ip?: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!branch) throw new NotFoundException('Branch not found in this workspace');

    const updated = await this.prisma.branch.update({
      where: { id },
      data: {
        name: input.name?.trim() || undefined,
        code: input.code?.trim(),
        address: (input.address as never) ?? undefined,
        isActive: input.isActive,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'branch.update',
      entityType: 'branch',
      entityId: id,
      oldValues: branch,
      newValues: input,
      ipAddress: ip,
    });
    return updated;
  }
}
