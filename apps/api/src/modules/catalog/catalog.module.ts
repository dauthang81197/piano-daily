import { Module } from '@nestjs/common';
import { ComposersController } from './composers.controller';
import { ComposersService } from './composers.service';
import { GenresController } from './genres.controller';
import { GenresService } from './genres.service';
import { SeriesController } from './series.controller';
import { SeriesService } from './series.service';

/** Module chủ của bảng Composer, Genre, Series (AD-1). Sheet/SheetGenre thêm ở Story 1.5. */
@Module({
  controllers: [ComposersController, GenresController, SeriesController],
  providers: [ComposersService, GenresService, SeriesService],
})
export class CatalogModule {}
