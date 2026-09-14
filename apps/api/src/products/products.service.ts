import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { ProductType } from '@erp/database';

export interface CreateProductInput {
  categoryId?: string;
  unitId?: string;
  taxRateId?: string;
  type?: ProductType;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  costPrice?: number;
  salePrice?: number;
}

export interface UpdateProductInput {
  categoryId?: string | null;
  unitId?: string | null;
  taxRateId?: string | null;
  type?: ProductType;
  name?: string;
  sku?: string;
  barcode?: string | null;
  description?: string | null;
  costPrice?: number | null;
  salePrice?: number | null;
  isActive?: boolean;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q?: string) {
    return this.prisma.product.findMany({
      where: {
        tenantId: user.tenantId,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      include: { category: true, unit: true, taxRate: true },
      orderBy: { name: 'asc' },
    });
  }

  async get(user: AuthUser, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { category: true, unit: true, taxRate: true },
    });
    if (!product) throw new NotFoundException('Product not found in this workspace');
    return product;
  }

  async create(user: AuthUser, input: CreateProductInput) {
    if (!input.name.trim()) throw new BadRequestException('Product name is required');
    if (!input.sku.trim()) throw new BadRequestException('Product SKU is required');

    const references = await this.resolveReferences(user, {
      categoryId: input.categoryId,
      unitId: input.unitId,
      taxRateId: input.taxRateId,
    });

    const product = await this.prisma.product.create({
      data: {
        tenantId: user.tenantId,
        categoryId: references.categoryId,
        unitId: references.unitId,
        taxRateId: references.taxRateId,
        type: input.type ?? 'GOOD',
        name: input.name.trim(),
        sku: input.sku.trim(),
        barcode: input.barcode?.trim() || undefined,
        description: input.description ?? undefined,
        costPrice: input.costPrice ?? undefined,
        salePrice: input.salePrice ?? undefined,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'product.create',
      entityType: 'product',
      entityId: product.id,
      newValues: input,
    });
    return product;
  }

  async update(user: AuthUser, id: string, input: UpdateProductInput) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!product) throw new NotFoundException('Product not found in this workspace');

    const references = await this.resolveReferences(user, {
      categoryId: input.categoryId,
      unitId: input.unitId,
      taxRateId: input.taxRateId,
    });

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(input.categoryId === undefined
          ? {}
          : { categoryId: (references.categoryId ?? null) as string | null }),
        ...(input.unitId === undefined
          ? {}
          : { unitId: (references.unitId ?? null) as string | null }),
        ...(input.taxRateId === undefined
          ? {}
          : { taxRateId: (references.taxRateId ?? null) as string | null }),
        type: input.type,
        name: input.name?.trim() || undefined,
        sku: input.sku?.trim() || undefined,
        barcode: input.barcode === undefined ? undefined : input.barcode?.trim() || null,
        description: input.description === undefined ? undefined : input.description,
        costPrice: input.costPrice === undefined ? undefined : input.costPrice,
        salePrice: input.salePrice === undefined ? undefined : input.salePrice,
        isActive: input.isActive,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'product.update',
      entityType: 'product',
      entityId: id,
      oldValues: product,
      newValues: input,
    });
    return updated;
  }

  private async resolveReferences(
    user: AuthUser,
    refs: { categoryId?: string | null; unitId?: string | null; taxRateId?: string | null },
  ) {
    const resolved = {
      categoryId: refs.categoryId ?? undefined,
      unitId: refs.unitId ?? undefined,
      taxRateId: refs.taxRateId ?? undefined,
    };
    if (refs.categoryId != null) {
      const found = await this.prisma.productCategory.findFirst({
        where: { id: refs.categoryId, tenantId: user.tenantId },
      });
      if (!found) throw new NotFoundException('Category not found in this workspace');
    }
    if (refs.unitId != null) {
      const found = await this.prisma.unit.findFirst({
        where: { id: refs.unitId, tenantId: user.tenantId },
      });
      if (!found) throw new NotFoundException('Unit not found in this workspace');
    }
    if (refs.taxRateId != null) {
      const found = await this.prisma.taxRate.findFirst({
        where: { id: refs.taxRateId, tenantId: user.tenantId },
      });
      if (!found) throw new NotFoundException('Tax rate not found in this workspace');
    }
    return resolved;
  }
}
