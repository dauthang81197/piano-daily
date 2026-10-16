import { Module } from '@nestjs/common';
import { BillingSuperAdminGuard } from '../billing/super-admin.guard';
import { CacheInvalidatorModule } from '../catalog/cache-invalidator.module';
import { CustomersModule } from '../customers/customers.module';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { AdminCourseCommunityController } from './admin-course-community.controller';
import { AdminCourseSubmissionsController } from './admin-course-submissions.controller';
import { AdminCoursesController } from './admin-courses.controller';
import { CourseCommunityService } from './course-community.service';
import { CourseProgressService } from './course-progress.service';
import { CourseSubmissionsService } from './course-submissions.service';
import { CoursesService } from './courses.service';
import { CustomerCoursesController } from './customer-courses.controller';
import { LessonMidiService } from './lesson-midi.service';
import { PublicCoursesController } from './public-courses.controller';
import { PublicCoursesService } from './public-courses.service';

/** Module chủ của các bảng `course_tracks`, `course_levels`, `course_sections`, `course_lessons` (khoá học C1). */
@Module({
  imports: [CacheInvalidatorModule, CustomersModule, IdentityModule, MediaModule],
  controllers: [AdminCourseCommunityController, AdminCourseSubmissionsController, AdminCoursesController, CustomerCoursesController, PublicCoursesController],
  providers: [CourseCommunityService, CourseProgressService, CourseSubmissionsService, CoursesService, LessonMidiService, PublicCoursesService, BillingSuperAdminGuard],
  exports: [PublicCoursesService],
})
export class CoursesModule {}
