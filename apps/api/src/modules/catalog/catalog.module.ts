import { Module } from '@nestjs/common';
import { ComposersController } from './composers.controller';
import { ComposersService } from './composers.service';
import { GenresController } from './genres.controller';
import { GenresService } from './genres.service';
import { SeriesController } from './series.controller';
import { SeriesService } from './series.service';
import { SheetsController } from './sheets.controller';
import { SheetsService } from './sheets.service';

/** Module chủ của bảng Composer, Genre, Series, Sheet, SheetGenre (AD-1). */
@Module({
  controllers: [ComposersController, GenresController, SeriesController, SheetsController],
  providers: [ComposersService, GenresService, SeriesService, SheetsService],
})
export class CatalogModule {}
