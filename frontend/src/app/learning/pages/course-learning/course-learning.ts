import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import {
  ChangeDetectorRef,
  Component,
  OnInit,
  inject
} from '@angular/core';

import {
  ActivatedRoute,
  RouterLink
} from '@angular/router';

import {
  catchError,
  forkJoin,
  map,
  of,
  switchMap
} from 'rxjs';

import { Course } from '../../models/course.model';
import { Enrollment } from '../../models/enrollment.model';

import {
  ContentProgress,
  ContentProgressUpdateRequest,
  CourseContent,
  CourseProgressSummary,
  LearningContentView,
  LearningModuleView
} from '../../models/learning-content.model';

import { CourseService } from '../../services/course.service';
import { EnrollmentService } from '../../services/enrollment.service';
import { CourseCertificateService } from '../../services/course-certificate.service';
import { LearningContentService } from '../../services/learning-content.service';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-course-learning',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink
  ],
  templateUrl: './course-learning.html',
  styleUrls: ['./course-learning.css']
})
export class CourseLearning implements OnInit {

  private readonly route =
    inject(ActivatedRoute);

  private readonly courseService =
    inject(CourseService);

  private readonly enrollmentService =
    inject(EnrollmentService);

  private readonly learningContentService =
    inject(LearningContentService);

  private readonly courseCertificateService =
    inject(CourseCertificateService);

  private readonly changeDetector =
    inject(ChangeDetectorRef);

  private readonly authService = inject(AuthService);

  get learnerId(): string {
    return this.authService.getLearnerId();
  }

  course: Course | null = null;

  enrollment: Enrollment | null = null;

  moduleGroups: LearningModuleView[] = [];

  progressSummary: CourseProgressSummary | null =
    null;

  isLoading = true;

  updatingContentId: string | null = null;

  isFinalizingCourse = false;

  errorMessage = '';

  actionMessage = '';

  ngOnInit(): void {
    const courseId =
      this.route.snapshot.paramMap.get('courseId');

    if (!courseId) {
      this.isLoading = false;

      this.errorMessage =
        'Course ID was not provided.';

      this.changeDetector.detectChanges();
      return;
    }

    this.loadCourseAndEnrollment(courseId);
  }

  loadCourseAndEnrollment(
    courseId: string
  ): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.actionMessage = '';

    this.changeDetector.detectChanges();

    forkJoin({
      course:
        this.courseService.getCourseById(courseId),

      enrollment:
        this.enrollmentService
          .getEnrollmentByLearnerAndCourse(
            this.learnerId,
            courseId
          )
    }).subscribe({
      next: ({ course, enrollment }) => {
        this.course = course;
        this.enrollment = enrollment;

        if (!enrollment.accessAllowed) {
          this.isLoading = false;

          this.errorMessage =
            'You do not currently have access to this course. Complete enrollment or payment before starting learning.';

          this.changeDetector.detectChanges();
          return;
        }

        this.loadLearningData(
          course.courseId,
          enrollment.enrollmentId
        );
      },

      error: (error: HttpErrorResponse) => {
        console.error(
          'Failed to load course enrollment:',
          error
        );

        this.isLoading = false;

        if (error.status === 404) {
          this.errorMessage =
            'No enrollment was found for this course.';
        } else {
          this.errorMessage =
            'Course learning information could not be loaded.';
        }

        this.changeDetector.detectChanges();
      }
    });
  }

  loadLearningData(
    courseId: string,
    enrollmentId: string
  ): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      modules:
        this.learningContentService
          .getPublishedModules(courseId),

      progress:
        this.learningContentService
          .getProgressByEnrollment(enrollmentId)
          .pipe(
            catchError((error) => {
              console.error(
                'Progress list could not be loaded:',
                error
              );

              return of([] as ContentProgress[]);
            })
          ),

      summary:
        this.learningContentService
          .getProgressSummary(enrollmentId)
          .pipe(
            catchError((error) => {
              console.error(
                'Progress summary could not be loaded:',
                error
              );

              return of(
                null as CourseProgressSummary | null
              );
            })
          )
    }).subscribe({
      next: ({
        modules,
        progress,
        summary
      }) => {
        this.progressSummary = summary;

        if (modules.length === 0) {
          this.moduleGroups = [];
          this.isLoading = false;

          this.changeDetector.detectChanges();
          return;
        }

        const progressMap =
          new Map<string, ContentProgress>();

        progress.forEach((item) => {
          progressMap.set(
            item.contentId,
            item
          );
        });

        const contentRequests =
          modules.map((courseModule) =>
            this.learningContentService
              .getPublishedContentsForLearner(
                courseId,
                courseModule.moduleId,
                this.learnerId
              )
              .pipe(
                catchError((error) => {
                  console.error(
                    `Contents could not be loaded for module ${courseModule.moduleId}:`,
                    error
                  );

                  return of(
                    [] as CourseContent[]
                  );
                }),

                map((contents) => ({
                  module: courseModule,

                  contents: contents.map(
                    (content): LearningContentView => ({
                      ...content,

                      progress:
                        progressMap.get(
                          content.contentId
                        ) ?? null
                    })
                  )
                }))
              )
          );

        forkJoin(contentRequests)
          .subscribe({
            next: (moduleGroups) => {
              this.moduleGroups =
                moduleGroups;

              if (summary) {
                this.finalizeCourseIfEligible(summary);
              }

              this.isLoading = false;

              this.changeDetector.detectChanges();
            },

            error: (error: unknown) => {
              console.error(
                'Learning contents could not be loaded:',
                error
              );

              this.moduleGroups = [];
              this.isLoading = false;

              this.errorMessage =
                'Learning contents could not be loaded.';

              this.changeDetector.detectChanges();
            }
          });
      },

      error: (error: unknown) => {
        console.error(
          'Learning modules could not be loaded:',
          error
        );

        this.isLoading = false;

        this.errorMessage =
          'Learning modules could not be loaded.';

        this.changeDetector.detectChanges();
      }
    });
  }

  updateContentProgress(
    content: LearningContentView,
    targetPercentage: number
  ): void {
    if (
      !this.enrollment ||
      this.updatingContentId !== null
    ) {
      return;
    }

    const safePercentage =
      Math.max(
        0,
        Math.min(100, targetPercentage)
      );

    const durationSeconds =
      Math.max(
        0,
        (content.durationMinutes ?? 0) * 60
      );

    const lastPositionSeconds =
      safePercentage === 100
        ? durationSeconds
        : Math.round(
          durationSeconds *
          safePercentage /
          100
        );

    const request:
      ContentProgressUpdateRequest = {

      progressPercentage:
        safePercentage,

      lastPositionSeconds,

      additionalTimeSpentSeconds: 60
    };

    this.updatingContentId =
      content.contentId;

    this.actionMessage = '';

    this.changeDetector.detectChanges();

    this.learningContentService
      .updateContentProgress(
        this.enrollment.enrollmentId,
        content.contentId,
        request
      )
      .subscribe({
        next: (updatedProgress) => {
          this.replaceContentProgress(
            updatedProgress
          );

          this.updatingContentId = null;

          this.actionMessage =
            safePercentage === 100
              ? `${content.title} completed successfully.`
              : `${content.title} progress updated to ${safePercentage}%.`;

          this.reloadProgressSummary();

          this.changeDetector.detectChanges();
        },

        error: (error: HttpErrorResponse) => {
          console.error(
            'Content progress update failed:',
            error
          );

          this.updatingContentId = null;

          this.actionMessage =
            this.getBackendErrorMessage(
              error,
              'Content progress could not be updated.'
            );

          this.changeDetector.detectChanges();
        }
      });
  }

  continueContent(
    content: LearningContentView
  ): void {
    const currentProgress =
      this.getProgressPercentage(content);

    let nextProgress: number;

    if (currentProgress === 0) {
      nextProgress = 25;
    } else if (currentProgress < 50) {
      nextProgress = 50;
    } else if (currentProgress < 75) {
      nextProgress = 75;
    } else {
      nextProgress = 100;
    }

    this.updateContentProgress(
      content,
      nextProgress
    );
  }

  completeContent(
    content: LearningContentView
  ): void {
    this.updateContentProgress(
      content,
      100
    );
  }

  reloadProgressSummary(): void {
    if (!this.enrollment) {
      return;
    }

    this.learningContentService
      .getProgressSummary(
        this.enrollment.enrollmentId
      )
      .subscribe({
        next: (summary) => {
          this.progressSummary = summary;

          this.finalizeCourseIfEligible(summary);

          this.changeDetector.detectChanges();
        },

        error: (error: unknown) => {
          console.error(
            'Progress summary refresh failed:',
            error
          );
        }
      });
  }

  private finalizeCourseIfEligible(
    summary: CourseProgressSummary
  ): void {
    if (
      !this.enrollment ||
      this.isFinalizingCourse ||
      this.enrollment.status === 'COMPLETED' ||
      summary.totalPublishedContents <= 0 ||
      summary.completedContents !== summary.totalPublishedContents ||
      !summary.allMandatoryContentsCompleted
    ) {
      return;
    }

    this.isFinalizingCourse = true;
    this.actionMessage = 'Finalizing course completion...';

    const enrollmentId = this.enrollment.enrollmentId;
    const recipientName =
      this.authService.currentUser()?.name?.trim() || 'SkillSphere Learner';

    this.enrollmentService
      .completeCourse(enrollmentId)
      .pipe(
        switchMap((completion) => {
          if (this.enrollment) {
            this.enrollment = {
              ...this.enrollment,
              status: 'COMPLETED',
              completedAt: completion.completedAt ?? null,
              accessAllowed: true
            };
          }

          if (!completion.certificateEligible) {
            return of(null);
          }

          return this.courseCertificateService
            .issueCertificate(
              completion.completionId,
              {
                recipientName
              }
            );
        })
      )
      .subscribe({
        next: (certificate) => {
          this.isFinalizingCourse = false;
          this.actionMessage = certificate
            ? 'Course completed and certificate generated successfully.'
            : 'Course completed successfully.';
          this.changeDetector.detectChanges();
        },

        error: (error: HttpErrorResponse) => {
          console.error('Course finalization failed:', error);
          this.isFinalizingCourse = false;
          this.actionMessage = this.getBackendErrorMessage(
            error,
            'Course completion could not be finalized.'
          );
          this.changeDetector.detectChanges();
        }
      });
  }

  replaceContentProgress(
    updatedProgress: ContentProgress
  ): void {
    this.moduleGroups =
      this.moduleGroups.map((group) => ({
        ...group,

        contents: group.contents.map(
          (content) =>
            content.contentId ===
            updatedProgress.contentId
              ? {
                ...content,
                progress: updatedProgress
              }
              : content
        )
      }));
  }

  getProgressPercentage(
    content: LearningContentView
  ): number {
    return content.progress
      ?.progressPercentage ?? 0;
  }

  getProgressStatus(
    content: LearningContentView
  ): string {
    return content.progress
      ?.status ?? 'NOT_STARTED';
  }

  getActionLabel(
    content: LearningContentView
  ): string {
    if (
      this.updatingContentId ===
      content.contentId
    ) {
      return 'Updating...';
    }

    const progress =
      this.getProgressPercentage(content);

    if (progress === 0) {
      return 'Start Content';
    }

    return 'Continue Learning';
  }

  getAssessmentActionLabel(
    content: LearningContentView
  ): string {
    return this.getProgressPercentage(content) === 100
      ? 'Retake Quiz'
      : 'Take Quiz';
  }

  isAssessmentContent(
    content: LearningContentView
  ): boolean {
    const contentType =
      content.contentType
        ?.toUpperCase();

    return contentType === 'QUIZ'
      || contentType === 'ASSIGNMENT'
      || contentType === 'ASSESSMENT';
  }

  openContent(
    content: LearningContentView
  ): void {
    if (!content.contentUrl) {
      return;
    }

    window.open(
      content.contentUrl,
      '_blank',
      'noopener,noreferrer'
    );
  }

  getContentIcon(
    contentType: string
  ): string {
    switch (
      contentType?.toUpperCase()
    ) {
      case 'VIDEO':
        return '▶';

      case 'QUIZ':
      case 'ASSIGNMENT':
      case 'ASSESSMENT':
        return '?';

      case 'DOCUMENT':
      case 'PDF':
        return 'D';

      case 'ARTICLE':
      case 'TEXT':
        return 'T';

      default:
        return 'L';
    }
  }

  formatTime(
    totalSeconds?: number | null
  ): string {
    if (!totalSeconds) {
      return '0 min';
    }

    const totalMinutes =
      Math.floor(totalSeconds / 60);

    const hours =
      Math.floor(totalMinutes / 60);

    const minutes =
      totalMinutes % 60;

    if (hours === 0) {
      return `${minutes} min`;
    }

    return `${hours}h ${minutes}m`;
  }

  trackModuleById(
    index: number,
    group: LearningModuleView
  ): string {
    return group.module.moduleId;
  }

  trackContentById(
    index: number,
    content: LearningContentView
  ): string {
    return content.contentId;
  }

  private getBackendErrorMessage(
    error: HttpErrorResponse,
    fallbackMessage: string
  ): string {
    const backendMessage =
      error.error?.message ||
      error.error?.error ||
      error.error?.details;

    if (
      typeof backendMessage === 'string' &&
      backendMessage.trim().length > 0
    ) {
      return backendMessage;
    }

    return fallbackMessage;
  }
}