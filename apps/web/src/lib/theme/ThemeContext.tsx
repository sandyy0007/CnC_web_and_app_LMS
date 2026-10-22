'use client';

import * as React from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  isLight: boolean;
}

const STORAGE_KEY = 'wc_theme';
const FALLBACK_KEY = 'winnerscreek-theme';

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function applyThemeToDOM(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', '#0b0f19');
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', '#F4F6F8');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize state reading from document class if available (set by anti-flash script)
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(FALLBACK_KEY);
        if (stored === 'light' || stored === 'dark') {
          return stored;
        }
        if (document.documentElement.classList.contains('light')) {
          return 'light';
        }
      } catch {
        // storage disabled
      }
    }
    return 'dark'; // Default dark to preserve Winners Creek dark identity
  });

  // Apply to DOM & sync state
  const setTheme = React.useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    applyThemeToDOM(nextTheme);
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
      localStorage.setItem(FALLBACK_KEY, nextTheme);
    } catch {
      // storage disabled
    }
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // Sync with DOM on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(FALLBACK_KEY);
      if (stored === 'light' || stored === 'dark') {
        if (stored !== theme) {
          setThemeState(stored);
        }
        applyThemeToDOM(stored);
      } else {
        applyThemeToDOM(theme);
      }
    } catch {
      applyThemeToDOM(theme);
    }
  }, [theme]);

  // Handle storage changes across tabs
  React.useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if ((e.key === STORAGE_KEY || e.key === FALLBACK_KEY) && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue);
        applyThemeToDOM(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isDark: theme === 'dark',
      isLight: theme === 'light',
    }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

