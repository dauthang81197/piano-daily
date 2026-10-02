import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { CacheInvalidator } from './cache-invalidator';
import { ComposersController } from './composers.controller';
import { ComposersService } from './composers.service';
import { GenresController } from './genres.controller';
import { GenresService } from './genres.service';
import { PublicSheetsController } from './public-sheets.controller';
import { PublicSheetsService } from './public-sheets.service';
import { SeriesController } from './series.controller';
import { SeriesService } from './series.service';
import { SheetFilesController } from './sheet-files.controller';
import { SheetsController } from './sheets.controller';
import { SheetsService } from './sheets.service';
import { SheetFileGcService } from './sheet-file-gc.service';

/** Module chủ của bảng Composer, Genre, Series, Sheet, SheetGenre, SheetFile (AD-1). Storage đi qua `media`. */
@Module({
  imports: [MediaModule],
  controllers: [ComposersController, GenresController, SeriesController, SheetsController, SheetFilesController, PublicSheetsController],
  providers: [CacheInvalidator, ComposersService, GenresService, SeriesService, SheetsService, PublicSheetsService, SheetFileGcService],
})
export class CatalogModule {}
