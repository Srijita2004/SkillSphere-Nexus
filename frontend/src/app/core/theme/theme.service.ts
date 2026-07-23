import { Injectable, effect, signal } from '@angular/core';

const THEME_KEY = 'ssn_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isDarkTheme = signal(this.readInitialTheme());

  constructor() {
    effect(() => {
      const dark = this.isDarkTheme();
      document.documentElement.classList.toggle('light-theme', !dark);
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.isDarkTheme.update((dark) => !dark);
  }

  private readInitialTheme(): boolean {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light') {
      return false;
    }
    if (stored === 'dark') {
      return true;
    }
    return !window.matchMedia?.('(prefers-color-scheme: light)').matches;
  }
}
