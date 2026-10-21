import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { ScoresModule } from '../scores/scores.module';
import { ImportWorkerService } from './import-worker.service';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

/** Module chủ của bảng `sheet_import_batches` / `sheet_import_items`: import Sheet hàng loạt (PDF → MIDI → Sheet) của admin, chạy nền. */
@Module({
  imports: [CatalogModule, IdentityModule, MediaModule, ScoresModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportWorkerService],
})
export class ImportsModule {}
