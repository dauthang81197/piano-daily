import { Module } from '@nestjs/common';
import { CacheInvalidator } from './cache-invalidator';

/** Provider revalidate cache web dùng chung (catalog, settings) — tách riêng để tránh vòng phụ thuộc module. */
@Module({
  providers: [CacheInvalidator],
  exports: [CacheInvalidator],
})
export class CacheInvalidatorModule {}
