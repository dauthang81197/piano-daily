import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type CreateGenreRequest,
  createGenreSchema,
  type ListQuery,
  listQuerySchema,
  type Page,
  type Genre,
  type UpdateGenreRequest,
  updateGenreSchema,
} from '@piano-daily/shared';
import { UuidParamPipe } from './catalog.helpers';
import { GenresService } from './genres.service';

/** CRUD Genre cho admin. Route `/admin/*` được guard JWT global bảo vệ. */
@Controller('admin/genres')
export class GenresController {
  constructor(private readonly service: GenresService) {}

  @Get()
  list(@Query({ schema: listQuerySchema }) query: ListQuery): Promise<Page<Genre>> {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id', UuidParamPipe) id: string): Promise<Genre> {
    return this.service.get(id);
  }

  @Post()
  create(@Body({ schema: createGenreSchema }) body: CreateGenreRequest): Promise<Genre> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id', UuidParamPipe) id: string, @Body({ schema: updateGenreSchema }) body: UpdateGenreRequest): Promise<Genre> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
