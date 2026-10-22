import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  type CreateDonorBody,
  createDonorBodySchema,
  type Donor,
  type PublicDonor,
  type UpdateDonorBody,
  updateDonorBodySchema,
} from '@piano-daily/shared';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { Public } from '../identity/public.decorator';
import { DonorsService } from './donors.service';

/** Người ủng hộ cho admin. Route `/admin/*` được guard JWT global bảo vệ. */
@Controller('admin/donors')
export class AdminDonorsController {
  constructor(private readonly donors: DonorsService) {}

  @Get()
  list(): Promise<Donor[]> {
    return this.donors.list();
  }

  @Post()
  create(@Body({ schema: createDonorBodySchema }) body: CreateDonorBody): Promise<Donor> {
    return this.donors.create(body);
  }

  @Patch(':id')
  update(@Param('id', UuidParamPipe) id: string, @Body({ schema: updateDonorBodySchema }) body: UpdateDonorBody): Promise<Donor> {
    return this.donors.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.donors.remove(id);
  }
}

/** Danh sách người ủng hộ công khai: chỉ bản ghi đang hiện. */
@Public()
@Controller('donors')
export class PublicDonorsController {
  constructor(private readonly donors: DonorsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(): Promise<PublicDonor[]> {
    return this.donors.listPublic();
  }
}
