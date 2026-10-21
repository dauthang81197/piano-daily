import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { CustomerScoresController } from './customer-scores.controller';
import { MusicscoreClient } from './musicscore.client';
import { ScoreGcService } from './score-gc.service';
import { ScoresService } from './scores.service';

/** Module chủ của bảng `score_conversions`: chuyển PDF/ảnh/MusicXML bản nhạc sang MIDI cho khách (kết quả tạm). */
@Module({
  imports: [CustomersModule, IdentityModule, MediaModule],
  controllers: [CustomerScoresController],
  providers: [MusicscoreClient, ScoreGcService, ScoresService],
  exports: [MusicscoreClient],
})
export class ScoresModule {}
