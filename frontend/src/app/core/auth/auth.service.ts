import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

export type UserRole = 'ADMIN' | 'HR' | 'LEARNER';

export interface AuthUser {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
}

interface BackendUser {
  userId: string;
  fullName: string;
  email: string;
  role: UserRole;
  active: boolean;
}

interface LegacyStoredAccount {
  userId: string;
  name: string;
  role: UserRole;
}

const SESSION_KEY = 'ssn_auth_user';
const LEGACY_ACCOUNTS_KEY = 'ssn_registered_accounts';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly authUrl = `${environment.learningApiUrl}/auth`;

  readonly currentUser = signal<AuthUser | null>(this.loadStoredSession());

  login(
    name: string,
    email: string,
    password: string,
    role: UserRole
  ): Observable<AuthUser> {
    const fullName = this.normalizeName(name);
    const normalizedEmail = email.trim().toLowerCase();
    const preferredUserId = this.findLegacyUserId(fullName, role);

    return this.http.post<BackendUser>(`${this.authUrl}/login`, {
      fullName,
      email: normalizedEmail,
      password,
      role,
      preferredUserId
    }).pipe(
      map((response): AuthUser => ({
        userId: response.userId,
        name: response.fullName,
        email: response.email,
        role: response.role
      })),
      tap((user) => {
        localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        this.currentUser.set(user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
    this.currentUser.set(null);
  }

  isLoggedIn(): boolean {
    return this.currentUser() !== null;
  }

  hasRole(...roles: UserRole[]): boolean {
    const user = this.currentUser();
    return !!user && roles.includes(user.role);
  }

  getLearnerId(): string {
    return this.currentUser()?.userId ?? '';
  }

  getCurrentUserId(): string {
    return this.currentUser()?.userId ?? '';
  }

  private loadStoredSession(): AuthUser | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) {
        return null;
      }

      const user = JSON.parse(raw) as AuthUser;
      if (!user.userId || !user.name || !user.email || !user.role) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return user;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  private findLegacyUserId(name: string, role: UserRole): string | null {
    try {
      const raw = localStorage.getItem(LEGACY_ACCOUNTS_KEY);
      if (!raw) {
        return null;
      }

      const accounts = JSON.parse(raw) as Record<string, LegacyStoredAccount>;
      const key = `${role}:${name.toLowerCase()}`;
      return accounts[key]?.userId ?? null;
    } catch {
      return null;
    }
  }

  private normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }
}
