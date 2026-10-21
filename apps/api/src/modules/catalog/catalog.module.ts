import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { CustomersModule } from '../customers/customers.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { SettingsModule } from '../settings/settings.module';
import { CacheInvalidatorModule } from './cache-invalidator.module';
import { ComposersController } from './composers.controller';
import { ComposersService } from './composers.service';
import { FreeDownloadSource } from './free-download-source.service';
import { PurchasableFilesSource } from './purchasable-files-source.service';
import { GenresController } from './genres.controller';
import { GenresService } from './genres.service';
import { MemberSheetsController } from './member-sheets.controller';
import { MemberSheetsService } from './member-sheets.service';
import { PricingService } from './pricing.service';
import { PublicSheetsController } from './public-sheets.controller';
import { PublicSheetsService } from './public-sheets.service';
import { SeriesController } from './series.controller';
import { SeriesService } from './series.service';
import { SheetFilesController } from './sheet-files.controller';
import { SheetSearchRepository } from './sheet-search.repository';
import { SheetViewDedupeGcService } from './sheet-view-dedupe-gc.service';
import { SheetViewsRepository } from './sheet-views.repository';
import { SheetViewsService } from './sheet-views.service';
import { SheetsController } from './sheets.controller';
import { SheetsService } from './sheets.service';
import { SheetFileGcService } from './sheet-file-gc.service';

/** Module chủ của bảng Composer, Genre, Series, Sheet, SheetGenre, SheetFile (AD-1). Storage đi qua `media`. */
@Module({
  imports: [MediaModule, IdentityModule, CustomersModule, SettingsModule, CacheInvalidatorModule, CoursesModule],
  controllers: [ComposersController, GenresController, SeriesController, SheetsController, SheetFilesController, MemberSheetsController, PublicSheetsController],
  providers: [PricingService, MemberSheetsService, FreeDownloadSource, PurchasableFilesSource, ComposersService, GenresService, SeriesService, SheetsService, PublicSheetsService, SheetSearchRepository, SheetFileGcService, SheetViewsRepository, SheetViewsService, SheetViewDedupeGcService],
  exports: [ComposersService, SheetsService, FreeDownloadSource, PricingService, PurchasableFilesSource],
})
export class CatalogModule {}
