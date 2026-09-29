import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type CreateSeriesRequest,
  createSeriesSchema,
  type ListQuery,
  listQuerySchema,
  type Page,
  type Series,
  type UpdateSeriesRequest,
  updateSeriesSchema,
} from '@piano-daily/shared';
import { UuidParamPipe } from './catalog.helpers';
import { SeriesService } from './series.service';

/** CRUD Series cho admin. Route `/admin/*` được guard JWT global bảo vệ. */
@Controller('admin/series')
export class SeriesController {
  constructor(private readonly service: SeriesService) {}

  @Get()
  list(@Query({ schema: listQuerySchema }) query: ListQuery): Promise<Page<Series>> {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id', UuidParamPipe) id: string): Promise<Series> {
    return this.service.get(id);
  }

  @Post()
  create(@Body({ schema: createSeriesSchema }) body: CreateSeriesRequest): Promise<Series> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id', UuidParamPipe) id: string, @Body({ schema: updateSeriesSchema }) body: UpdateSeriesRequest): Promise<Series> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
