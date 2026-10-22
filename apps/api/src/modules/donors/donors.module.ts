import { Module } from '@nestjs/common';
import { AdminDonorsController, PublicDonorsController } from './donors.controller';
import { DonorsService } from './donors.service';

/** Module chủ của bảng `donors`. */
@Module({
  controllers: [AdminDonorsController, PublicDonorsController],
  providers: [DonorsService],
})
export class DonorsModule {}
