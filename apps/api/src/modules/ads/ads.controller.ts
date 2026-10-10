import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  type AdSlot,
  type CreateAdSlotBody,
  createAdSlotBodySchema,
  type PublicAdSlot,
  type SetAdSlotActiveBody,
  setAdSlotActiveBodySchema,
  type UpdateAdSlotBody,
  updateAdSlotBodySchema,
} from '@piano-daily/shared';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { Public } from '../identity/public.decorator';
import { AdsService } from './ads.service';
import { SuperAdminGuard } from './super-admin.guard';

/** Quảng cáo cho admin. Xem: mọi admin đã đăng nhập; ghi: chỉ SUPER_ADMIN (kể cả `html_code`). */
@Controller('admin/ads')
export class AdminAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  list(): Promise<AdSlot[]> {
    return this.ads.list();
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  create(@Body({ schema: createAdSlotBodySchema }) body: CreateAdSlotBody): Promise<AdSlot> {
    return this.ads.create(body);
  }

  @Patch(':id')
  @UseGuards(SuperAdminGuard)
  update(
    @Param('id', UuidParamPipe) id: string,
    @Body({ schema: updateAdSlotBodySchema }) body: UpdateAdSlotBody,
  ): Promise<AdSlot> {
    return this.ads.update(id, body);
  }

  @Patch(':id/active')
  @UseGuards(SuperAdminGuard)
  setActive(
    @Param('id', UuidParamPipe) id: string,
    @Body({ schema: setAdSlotActiveBodySchema }) body: SetAdSlotActiveBody,
  ): Promise<AdSlot> {
    return this.ads.setActive(id, body.isActive);
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.ads.remove(id);
  }
}

/** Quảng cáo công khai: chỉ slot đang bật. */
@Public()
@Controller('ads')
export class PublicAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  list(): Promise<PublicAdSlot[]> {
    return this.ads.listPublic();
  }
}
