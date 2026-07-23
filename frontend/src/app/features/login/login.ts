import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService, UserRole } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly themeService = inject(ThemeService);

  fullName = '';
  email = '';
  password = '';
  role: UserRole = 'LEARNER';
  showPassword = false;
  errorMessage = '';
  isSigningIn = false;

  readonly roles: { value: UserRole; label: string; shortLabel: string; description: string }[] = [
    {
      value: 'LEARNER',
      label: 'Learner',
      shortLabel: 'Learn',
      description: 'Courses, learning paths and achievements'
    },
    {
      value: 'HR',
      label: 'HR Manager',
      shortLabel: 'Manage',
      description: 'People, payments and development plans'
    },
    {
      value: 'ADMIN',
      label: 'Administrator',
      shortLabel: 'Control',
      description: 'Courses, content and platform operations'
    }
  ];

  submit(): void {
    if (this.isSigningIn) {
      return;
    }

    const name = this.fullName.trim();
    const email = this.email.trim().toLowerCase();

    if (name.length < 2) {
      this.errorMessage = 'Enter your full name.';
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.errorMessage = 'Enter a valid email address.';
      return;
    }

    if (this.password.length < 8) {
      this.errorMessage = 'Password must contain at least 8 characters.';
      return;
    }

    this.errorMessage = '';
    this.isSigningIn = true;

    this.authService.login(name, email, this.password, this.role).subscribe({
      next: () => {
        this.isSigningIn = false;
        this.password = '';
        this.router.navigateByUrl('/dashboard');
      },
      error: (error: HttpErrorResponse) => {
        this.isSigningIn = false;
        this.errorMessage =
          error.error?.message ||
          'Sign in failed. Check your credentials and make sure the backend services are running.';
      }
    });
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }
}
