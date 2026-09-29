import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type CreateComposerRequest,
  createComposerSchema,
  type ListQuery,
  listQuerySchema,
  type Page,
  type Composer,
  type UpdateComposerRequest,
  updateComposerSchema,
} from '@piano-daily/shared';
import { UuidParamPipe } from './catalog.helpers';
import { ComposersService } from './composers.service';

/** CRUD Composer cho admin. Route `/admin/*` được guard JWT global bảo vệ. */
@Controller('admin/composers')
export class ComposersController {
  constructor(private readonly service: ComposersService) {}

  @Get()
  list(@Query({ schema: listQuerySchema }) query: ListQuery): Promise<Page<Composer>> {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id', UuidParamPipe) id: string): Promise<Composer> {
    return this.service.get(id);
  }

  @Post()
  create(@Body({ schema: createComposerSchema }) body: CreateComposerRequest): Promise<Composer> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id', UuidParamPipe) id: string, @Body({ schema: updateComposerSchema }) body: UpdateComposerRequest): Promise<Composer> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.service.remove(id);
  }
}
