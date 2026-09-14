import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';

export interface CreateCategoryInput {
  parentId?: string;
  name: string;
  code?: string;
  description?: string;
}

export interface UpdateCategoryInput {
  parentId?: string | null;
  name?: string;
  code?: string | null;
  description?: string | null;
  isActive?: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    return this.prisma.productCategory.findMany({
      where: { tenantId: user.tenantId },
      include: { children: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(user: AuthUser, input: CreateCategoryInput) {
    if (!input.name.trim()) throw new BadRequestException('Category name is required');

    const parentId = await this.resolveParent(user, input.parentId);

    const category = await this.prisma.productCategory.create({
      data: {
        tenantId: user.tenantId,
        parentId,
        name: input.name.trim(),
        code: input.code?.trim() || undefined,
        description: input.description ?? undefined,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'product_category.create',
      entityType: 'product_category',
      entityId: category.id,
      newValues: input,
    });
    return category;
  }

  async update(user: AuthUser, id: string, input: UpdateCategoryInput) {
    const category = await this.prisma.productCategory.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!category) throw new NotFoundException('Category not found in this workspace');

    let parentId = input.parentId;
    if (input.parentId === undefined) {
      parentId = category.parentId;
    } else if (input.parentId === null) {
      parentId = null;
    } else {
      parentId = await this.resolveParent(user, input.parentId);
      if (parentId === id) throw new BadRequestException('A category cannot be its own parent');
    }

    const updated = await this.prisma.productCategory.update({
      where: { id },
      data: {
        parentId: parentId ?? null,
        name: input.name?.trim() || undefined,
        code: input.code === undefined ? undefined : input.code?.trim() || null,
        description: input.description === undefined ? undefined : input.description,
        isActive: input.isActive,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.userId,
      action: 'product_category.update',
      entityType: 'product_category',
      entityId: id,
      oldValues: category,
      newValues: input,
    });
    return updated;
  }

  private async resolveParent(user: AuthUser, parentId?: string): Promise<string | undefined> {
    if (!parentId) return undefined;
    const parent = await this.prisma.productCategory.findFirst({
      where: { id: parentId, tenantId: user.tenantId },
    });
    if (!parent) throw new NotFoundException('Parent category not found in this workspace');
    return parent.id;
  }
}
