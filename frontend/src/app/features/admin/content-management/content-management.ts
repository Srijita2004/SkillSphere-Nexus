import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Course } from '../../../learning/models/course.model';
import {
  CourseContent,
  CourseModule
} from '../../../learning/models/learning-content.model';
import { CourseService } from '../../../learning/services/course.service';
import { LearningContentService } from '../../../learning/services/learning-content.service';
import { ToastService } from '../../../shared/services/toast.service';
import { ConfirmService } from '../../../shared/services/confirm.service';

const CONTENT_TYPES = [
  'VIDEO', 'DOCUMENT', 'ARTICLE', 'EXTERNAL_LINK', 'QUIZ', 'ASSIGNMENT', 'LIVE_SESSION'
];

interface ModuleFormState {
  title: string;
  description: string;
  moduleOrder: number;
}

interface ContentFormState {
  title: string;
  description: string;
  contentType: string;
  contentUrl: string;
  textContent: string;
  durationMinutes: number | null;
  contentOrder: number;
  mandatory: boolean;
  previewAvailable: boolean;
}

const EMPTY_MODULE_FORM: ModuleFormState = {
  title: '',
  description: '',
  moduleOrder: 1
};

const EMPTY_CONTENT_FORM: ContentFormState = {
  title: '',
  description: '',
  contentType: 'VIDEO',
  contentUrl: '',
  textContent: '',
  durationMinutes: null,
  contentOrder: 1,
  mandatory: true,
  previewAvailable: false
};

@Component({
  selector: 'app-content-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './content-management.html',
  styleUrls: ['./content-management.css']
})
export class ContentManagement implements OnInit {

  private readonly courseService = inject(CourseService);
  private readonly contentService = inject(LearningContentService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);

  readonly contentTypes = CONTENT_TYPES;

  courses: Course[] = [];
  selectedCourseId = '';

  modules: CourseModule[] = [];
  isLoadingModules = false;

  selectedModuleId = '';
  contents: CourseContent[] = [];
  isLoadingContents = false;

  // Module form
  isModuleFormOpen = false;
  isEditingModule = false;
  editingModuleId: string | null = null;
  moduleForm: ModuleFormState = { ...EMPTY_MODULE_FORM };
  moduleFormErrors: string[] = [];

  // Content form
  isContentFormOpen = false;
  isEditingContent = false;
  editingContentId: string | null = null;
  contentForm: ContentFormState = { ...EMPTY_CONTENT_FORM };
  contentFormErrors: string[] = [];

  ngOnInit(): void {
    this.courseService.getAllCourses().subscribe({
      next: (courses) => (this.courses = courses),
      error: () => this.toastService.showError('Could not load courses.')
    });
  }

  onCourseChange(): void {
    this.selectedModuleId = '';
    this.contents = [];
    if (!this.selectedCourseId) {
      this.modules = [];
      return;
    }
    this.loadModules();
  }

  loadModules(): void {
    this.isLoadingModules = true;
    this.contentService.getAllModules(this.selectedCourseId).subscribe({
      next: (modules) => {
        this.modules = modules;
        this.isLoadingModules = false;
      },
      error: () => {
        this.modules = [];
        this.isLoadingModules = false;
        this.toastService.showError('Could not load modules for this course.');
      }
    });
  }

  onModuleChange(): void {
    if (!this.selectedModuleId) {
      this.contents = [];
      return;
    }
    this.loadContents();
  }

  loadContents(): void {
    this.isLoadingContents = true;
    this.contentService
      .getAllContents(this.selectedCourseId, this.selectedModuleId)
      .subscribe({
        next: (contents) => {
          this.contents = contents;
          this.isLoadingContents = false;
        },
        error: () => {
          this.contents = [];
          this.isLoadingContents = false;
          this.toastService.showError('Could not load content for this module.');
        }
      });
  }

  // ---- Module CRUD ----

  openCreateModuleForm(): void {
    this.isEditingModule = false;
    this.editingModuleId = null;
    this.moduleForm = {
      ...EMPTY_MODULE_FORM,
      moduleOrder: this.modules.length + 1
    };
    this.moduleFormErrors = [];
    this.isModuleFormOpen = true;
  }

  openEditModuleForm(module: CourseModule): void {
    this.isEditingModule = true;
    this.editingModuleId = module.moduleId;
    this.moduleForm = {
      title: module.title,
      description: module.description ?? '',
      moduleOrder: module.moduleOrder
    };
    this.moduleFormErrors = [];
    this.isModuleFormOpen = true;
  }

  closeModuleForm(): void {
    this.isModuleFormOpen = false;
  }

  saveModule(): void {
    const errors: string[] = [];
    if (!this.moduleForm.title.trim()) {
      errors.push('Module title is required.');
    }
    if (!this.moduleForm.moduleOrder || this.moduleForm.moduleOrder < 1) {
      errors.push('Module order must be at least 1.');
    }
    this.moduleFormErrors = errors;
    if (errors.length > 0) {
      return;
    }

    const request$ = this.isEditingModule && this.editingModuleId
      ? this.contentService.updateModule(this.selectedCourseId, this.editingModuleId, this.moduleForm)
      : this.contentService.createModule(this.selectedCourseId, this.moduleForm);

    request$.subscribe({
      next: () => {
        this.isModuleFormOpen = false;
        this.toastService.showSuccess(
          this.isEditingModule ? 'Module updated.' : 'Module created.'
        );
        this.loadModules();
      },
      error: (error: unknown) => {
        this.toastService.showError(this.extractErrorMessage(error) ?? 'Could not save module.');
      }
    });
  }

  async deleteModule(module: CourseModule): Promise<void> {
    const confirmed = await this.confirmService.ask(
      'Delete Module',
      `Delete module "${module.title}"? Its content will also be removed.`
    );
    if (!confirmed) {
      return;
    }

    this.contentService.deleteModule(this.selectedCourseId, module.moduleId).subscribe({
      next: () => {
        this.toastService.showSuccess('Module deleted.');
        if (this.selectedModuleId === module.moduleId) {
          this.selectedModuleId = '';
          this.contents = [];
        }
        this.loadModules();
      },
      error: (error: unknown) => {
        this.toastService.showError(this.extractErrorMessage(error) ?? 'Could not delete module.');
      }
    });
  }

  togglePublishModule(module: CourseModule): void {
    const request$ = module.published
      ? this.contentService.unpublishModule(this.selectedCourseId, module.moduleId)
      : this.contentService.publishModule(this.selectedCourseId, module.moduleId);

    request$.subscribe({
      next: () => this.loadModules(),
      error: (error: unknown) => {
        this.toastService.showError(this.extractErrorMessage(error) ?? 'Could not update module status.');
      }
    });
  }

  // ---- Content CRUD ----

  openCreateContentForm(): void {
    this.isEditingContent = false;
    this.editingContentId = null;
    this.contentForm = {
      ...EMPTY_CONTENT_FORM,
      contentOrder: this.contents.length + 1
    };
    this.contentFormErrors = [];
    this.isContentFormOpen = true;
  }

  openEditContentForm(content: CourseContent): void {
    this.isEditingContent = true;
    this.editingContentId = content.contentId;
    this.contentForm = {
      title: content.title,
      description: content.description ?? '',
      contentType: content.contentType,
      contentUrl: content.contentUrl ?? '',
      textContent: content.textContent ?? '',
      durationMinutes: content.durationMinutes ?? null,
      contentOrder: content.contentOrder,
      mandatory: content.mandatory,
      previewAvailable: content.previewAvailable
    };
    this.contentFormErrors = [];
    this.isContentFormOpen = true;
  }

  closeContentForm(): void {
    this.isContentFormOpen = false;
  }

  saveContent(): void {
    const errors: string[] = [];
    if (!this.contentForm.title.trim()) {
      errors.push('Content title is required.');
    }
    if (!this.contentForm.contentType) {
      errors.push('Content type is required.');
    }
    if (!this.contentForm.contentOrder || this.contentForm.contentOrder < 1) {
      errors.push('Content order must be at least 1.');
    }
    if (this.contentForm.durationMinutes !== null && this.contentForm.durationMinutes < 1) {
      errors.push('Duration must be at least 1 minute if provided.');
    }
    this.contentFormErrors = errors;
    if (errors.length > 0) {
      return;
    }

    const payload = {
      title: this.contentForm.title,
      description: this.contentForm.description || null,
      contentType: this.contentForm.contentType,
      contentUrl: this.contentForm.contentUrl || null,
      textContent: this.contentForm.textContent || null,
      durationMinutes: this.contentForm.durationMinutes,
      contentOrder: this.contentForm.contentOrder,
      mandatory: this.contentForm.mandatory,
      previewAvailable: this.contentForm.previewAvailable
    };

    const request$ = this.isEditingContent && this.editingContentId
      ? this.contentService.updateContent(
          this.selectedCourseId, this.selectedModuleId, this.editingContentId, payload
        )
      : this.contentService.createContent(
          this.selectedCourseId, this.selectedModuleId, payload
        );

    request$.subscribe({
      next: () => {
        this.isContentFormOpen = false;
        this.toastService.showSuccess(
          this.isEditingContent ? 'Content updated.' : 'Content added.'
        );
        this.loadContents();
        this.loadModules();
      },
      error: (error: unknown) => {
        this.toastService.showError(this.extractErrorMessage(error) ?? 'Could not save content.');
      }
    });
  }

  async deleteContent(content: CourseContent): Promise<void> {
    const confirmed = await this.confirmService.ask(
      'Delete Content',
      `Delete "${content.title}"? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    this.contentService
      .deleteContent(this.selectedCourseId, this.selectedModuleId, content.contentId)
      .subscribe({
        next: () => {
          this.toastService.showSuccess('Content deleted.');
          this.loadContents();
          this.loadModules();
        },
        error: (error: unknown) => {
          this.toastService.showError(this.extractErrorMessage(error) ?? 'Could not delete content.');
        }
      });
  }

  togglePublishContent(content: CourseContent): void {
    const request$ = content.published
      ? this.contentService.unpublishContent(this.selectedCourseId, this.selectedModuleId, content.contentId)
      : this.contentService.publishContent(this.selectedCourseId, this.selectedModuleId, content.contentId);

    request$.subscribe({
      next: () => this.loadContents(),
      error: (error: unknown) => {
        this.toastService.showError(this.extractErrorMessage(error) ?? 'Could not update content status.');
      }
    });
  }

  trackById(index: number, item: { moduleId?: string; contentId?: string }): string {
    return item.moduleId ?? item.contentId ?? String(index);
  }

  private extractErrorMessage(error: unknown): string | null {
    const err = error as { error?: { message?: string } };
    return err?.error?.message ?? null;
  }
}
