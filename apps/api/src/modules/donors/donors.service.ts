import { Injectable } from '@nestjs/common';
import { type CreateDonorBody, DONOR_PUBLIC_LIMIT, type Donor, type PublicDonor, type UpdateDonorBody } from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import { isPrismaError } from '../catalog/prisma-errors';

const NOT_FOUND = 'Không tìm thấy người ủng hộ.';
const ORDER = [{ donatedAt: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }];

type Row = {
  id: string;
  name: string;
  amount: number | null;
  message: string | null;
  donatedAt: Date;
  isVisible: boolean;
  createdAt: Date;
};

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

const toPublic = (r: Row): PublicDonor => ({
  id: r.id,
  name: r.name,
  amount: r.amount,
  message: r.message,
  donatedAt: dateOnly(r.donatedAt),
});

const toDonor = (r: Row): Donor => ({ ...toPublic(r), isVisible: r.isVisible, createdAt: r.createdAt.toISOString() });

const toData = (body: CreateDonorBody | UpdateDonorBody) => ({
  ...(body.name !== undefined && { name: body.name }),
  ...(body.amount !== undefined && { amount: body.amount }),
  ...(body.message !== undefined && { message: body.message }),
  ...(body.donatedAt !== undefined && { donatedAt: new Date(`${body.donatedAt}T00:00:00.000Z`) }),
  ...(body.isVisible !== undefined && { isVisible: body.isVisible }),
});

/** Người ủng hộ: admin nhập tay, web chỉ đọc bản ghi đang hiện. */
@Injectable()
export class DonorsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(): Promise<PublicDonor[]> {
    const rows = await this.prisma.donor.findMany({ where: { isVisible: true }, orderBy: ORDER, take: DONOR_PUBLIC_LIMIT });
    return rows.map(toPublic);
  }

  async list(): Promise<Donor[]> {
    const rows = await this.prisma.donor.findMany({ orderBy: ORDER });
    return rows.map(toDonor);
  }

  async create(body: CreateDonorBody): Promise<Donor> {
    return toDonor(await this.prisma.donor.create({ data: { ...toData(body), name: body.name } }));
  }

  async update(id: string, body: UpdateDonorBody): Promise<Donor> {
    try {
      return toDonor(await this.prisma.donor.update({ where: { id }, data: toData(body) }));
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.donor.delete({ where: { id } });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND);
      throw err;
    }
  }
}
