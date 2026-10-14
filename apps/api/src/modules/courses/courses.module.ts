import { Module } from '@nestjs/common';
import { BillingSuperAdminGuard } from '../billing/super-admin.guard';
import { CacheInvalidatorModule } from '../catalog/cache-invalidator.module';
import { MediaModule } from '../media/media.module';
import { AdminCoursesController } from './admin-courses.controller';
import { CoursesService } from './courses.service';
import { LessonMidiService } from './lesson-midi.service';
import { PublicCoursesController } from './public-courses.controller';
import { PublicCoursesService } from './public-courses.service';

/** Module chủ của các bảng `course_tracks`, `course_levels`, `course_sections`, `course_lessons` (khoá học C1). */
@Module({
  imports: [CacheInvalidatorModule, MediaModule],
  controllers: [AdminCoursesController, PublicCoursesController],
  providers: [CoursesService, LessonMidiService, PublicCoursesService, BillingSuperAdminGuard],
  exports: [PublicCoursesService],
})
export class CoursesModule {}
