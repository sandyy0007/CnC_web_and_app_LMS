'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme/ThemeContext';

export interface BackgroundConfig {
  image?: string;
  imageAlt?: string;
  variant?: 'dark' | 'light';
  blur?: number; // 4 - 10px
  overlayOpacity?: number;
  withGrid?: boolean;
  withOrbs?: boolean;
  orbTone?: 'indigo' | 'cyan' | 'purple' | 'amber';
}

interface BackgroundContextType {
  config: BackgroundConfig;
  setBackground: (config: BackgroundConfig) => void;
  resetBackground: () => void;
}

const BackgroundContext = React.createContext<BackgroundContextType | undefined>(undefined);

/**
 * Route-to-image mapping for all primary portals and pages in Winners Creek.
 * When no explicit background is overridden, this mapping guarantees every single
 * page has an immersive, purpose-matched high-definition background image.
 */
function getDefaultImageForPath(pathname: string): {
  image: string;
  imageAlt: string;
  variant: 'dark' | 'light';
  orbTone: 'indigo' | 'cyan' | 'purple' | 'amber';
} {
  // 1. Student Portal
  if (pathname.startsWith('/student')) {
    if (pathname.includes('/live-classes')) {
      return {
        image: '/images/backgrounds/live-class.webp',
        imageAlt: 'Virtual Live Classroom Environment',
        variant: 'dark',
        orbTone: 'cyan',
      };
    }
    if (pathname.includes('/learning') || pathname.includes('/courses')) {
      return {
        image: '/images/backgrounds/courses.webp',
        imageAlt: 'Curriculum & Learning Module Environment',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/games')) {
      return {
        image: 'none',
        imageAlt: 'Interactive Gamification & Skill Arena',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/payments')) {
      return {
        image: '/images/backgrounds/payments.webp',
        imageAlt: 'Payments & Fee Transaction Portal',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/profile')) {
      return {
        image: '/images/backgrounds/profile.webp',
        imageAlt: 'Participant Profile & Academic Records',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    return {
      image: '/images/backgrounds/student.webp',
      imageAlt: 'Participant Learning & Career Platform',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }

  // 2. Trainer Portal
  if (pathname.startsWith('/trainer')) {
    if (pathname.includes('/classes') || pathname.includes('/live')) {
      return {
        image: '/images/backgrounds/live-class.webp',
        imageAlt: 'Trainer Live Classroom Signaling Studio',
        variant: 'dark',
        orbTone: 'cyan',
      };
    }
    if (pathname.includes('/attendance')) {
      return {
        image: '/images/backgrounds/attendance.webp',
        imageAlt: 'Trainer Attendance & Cohort Tracking',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/batches')) {
      return {
        image: '/images/backgrounds/colleges.webp',
        imageAlt: 'Campus Batches & Cohort Management',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    return {
      image: '/images/backgrounds/trainer.webp',
      imageAlt: 'Trainer Mentorship & Assessment Portal',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }

  // 3. HOD Portal
  if (pathname.startsWith('/hod')) {
    if (pathname.includes('/attendance')) {
      return {
        image: '/images/backgrounds/attendance.webp',
        imageAlt: 'Departmental Attendance Analytics',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/participants')) {
      return {
        image: '/images/backgrounds/users.webp',
        imageAlt: 'Department Participant Cohort Directory',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    return {
      image: '/images/backgrounds/hod.webp',
      imageAlt: 'Head of Department Administrative Command',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }

  // 4. Admin Portal
  if (pathname.startsWith('/admin')) {
    if (pathname.includes('/users')) {
      return {
        image: '/images/backgrounds/users.webp',
        imageAlt: 'College User Directory Management',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/trainers')) {
      return {
        image: '/images/backgrounds/trainer.webp',
        imageAlt: 'Faculty Roster Administration',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/departments') || pathname.includes('/colleges')) {
      return {
        image: '/images/backgrounds/colleges.webp',
        imageAlt: 'College & Department Architecture',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/payments')) {
      return {
        image: '/images/backgrounds/payments.webp',
        imageAlt: 'Institutional Payments & Ledger',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/reports')) {
      return {
        image: '/images/backgrounds/reports.webp',
        imageAlt: 'Institutional Compliance Reports',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/games')) {
      return {
        image: '/images/backgrounds/games.webp',
        imageAlt: 'Gamification Control Center',
        variant: 'dark',
        orbTone: 'purple',
      };
    }
    return {
      image: '/images/backgrounds/admin.webp',
      imageAlt: 'College Administration Command Console',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }

  // 5. Super Admin Portal
  if (pathname.startsWith('/super-admin')) {
    if (pathname.includes('/colleges')) {
      return {
        image: '/images/backgrounds/colleges.webp',
        imageAlt: 'Multi-Tenant Institution Management',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/courses')) {
      return {
        image: '/images/backgrounds/courses.webp',
        imageAlt: 'Global Course Catalog Management',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/users')) {
      return {
        image: '/images/backgrounds/users.webp',
        imageAlt: 'Global Platform User Governance',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/payments')) {
      return {
        image: '/images/backgrounds/payments.webp',
        imageAlt: 'Global Financial Ledger & Audit',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    if (pathname.includes('/games')) {
      return {
        image: '/images/backgrounds/games.webp',
        imageAlt: 'Global Mini-Game Management',
        variant: 'dark',
        orbTone: 'purple',
      };
    }
    if (pathname.includes('/system') || pathname.includes('/analytics')) {
      return {
        image: '/images/backgrounds/analytics.webp',
        imageAlt: 'Platform Infrastructure Analytics',
        variant: 'dark',
        orbTone: 'indigo',
      };
    }
    return {
      image: '/images/backgrounds/super-admin.webp',
      imageAlt: 'Super Admin Master Console',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }

  if (pathname.startsWith('/courses')) {
    return {
      image: '/images/backgrounds/courses.webp',
      imageAlt: 'Winners Creek Course Catalog',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }
  if (pathname.startsWith('/ebooks')) {
    return {
      image: '/images/backgrounds/courses.webp',
      imageAlt: 'Winners Creek Digital Library & eBooks',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }
  if (pathname.startsWith('/trainers')) {
    return {
      image: '/images/trainer-ai.webp',
      imageAlt: 'Winners Creek Faculty & Mentors',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }
  if (pathname.startsWith('/about')) {
    return {
      image: '/images/backgrounds/colleges.webp',
      imageAlt: 'About Winners Creek Institution Platform',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }
  if (pathname.startsWith('/contact')) {
    return {
      image: '/images/backgrounds/student.webp',
      imageAlt: 'Contact & Support',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }
  if (pathname.startsWith('/announcements')) {
    return {
      image: '/images/backgrounds/notifications.webp',
      imageAlt: 'Platform Announcements & Notifications',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }

  // 7. Auth Pages
  if (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/verify-otp'
  ) {
    return {
      image: '/images/tech-orbit.webp',
      imageAlt: 'Winners Creek Secure Authentication',
      variant: 'dark',
      orbTone: 'indigo',
    };
  }

  // 8. Default: Homepage
  return {
    image: '/images/hero-ai.webp',
    imageAlt: 'Winners Creek Modern Learning & Employability Platform',
    variant: 'dark',
    orbTone: 'indigo',
  };
}

export function GlobalBackgroundProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const [overrideConfig, setOverrideConfig] = React.useState<BackgroundConfig | null>(null);

  // Clear page-level override on navigation
  React.useEffect(() => {
    setOverrideConfig(null);
  }, [pathname]);

  const defaultRouteConfig = React.useMemo(() => getDefaultImageForPath(pathname), [pathname]);

  const activeConfig: BackgroundConfig = React.useMemo(() => {
    return {
      image: overrideConfig?.image ?? defaultRouteConfig.image,
      imageAlt: overrideConfig?.imageAlt ?? defaultRouteConfig.imageAlt,
      variant: overrideConfig?.variant ?? defaultRouteConfig.variant,
      blur: overrideConfig?.blur ?? 6,
      overlayOpacity: overrideConfig?.overlayOpacity,
      withGrid: overrideConfig?.withGrid ?? true,
      withOrbs: overrideConfig?.withOrbs ?? true,
      orbTone: overrideConfig?.orbTone ?? defaultRouteConfig.orbTone,
    };
  }, [overrideConfig, defaultRouteConfig]);

  const setBackground = React.useCallback((config: BackgroundConfig) => {
    setOverrideConfig(config);
  }, []);

  const resetBackground = React.useCallback(() => {
    setOverrideConfig(null);
  }, []);

  const contextValue = React.useMemo(
    () => ({
      config: activeConfig,
      setBackground,
      resetBackground,
    }),
    [activeConfig, setBackground, resetBackground],
  );

  return (
    <BackgroundContext.Provider value={contextValue}>
      <GlobalBackgroundLayer config={activeConfig} />
      {children}
    </BackgroundContext.Provider>
  );
}

export function useGlobalBackground() {
  const context = React.useContext(BackgroundContext);
  if (!context) {
    throw new Error('useGlobalBackground must be used within a GlobalBackgroundProvider');
  }
  return context;
}

/**
 * Root fixed full-page background layer.
 * Stretches across the entire viewport continuously:
 * - position: fixed, inset: 0, z-index: 0
 * - Does NOT stop at 100vh or any content container
 * - Image has subtle blur (4-8px) and 1.05 scale to prevent boundary vignetting
 * - Readability gradient overlay ensures 100% crisp typography
 * - Ambient subtle cyber tech grid + radiant atmospheric orbs
 */
export function GlobalBackgroundLayer({ config }: { config: BackgroundConfig }) {
  const { theme } = useTheme();
  const {
    image = '/images/hero-ai.webp',
    imageAlt = 'Winners Creek Environment',
    variant,
    blur = 6,
    overlayOpacity,
    withGrid = true,
    withOrbs = true,
    orbTone = 'indigo',
  } = config;

  const activeVariant = theme;
  const safeBlur = Math.min(Math.max(blur, 4), 10);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-screen w-screen overflow-hidden select-none"
    >
      {/* 1. Real Image Layer — Full-Bleed Fixed Viewport */}
      {image && image !== 'none' ? (
        <div className="absolute inset-0 h-full w-full">
          <Image
            src={image}
            alt={imageAlt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-center transition-all duration-700 ease-out"
            style={{
              filter: `blur(${safeBlur}px)`,
              transform: 'scale(1.05)',
            }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0 transition-colors duration-500 bg-[#F4F6F8] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(226,232,240,0.6),rgba(244,246,248,1))] dark:bg-slate-950 dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(30,41,59,0.5),rgba(2,6,23,1))]"
        />
      )}

      {/* 2. Global Readability Overlay Layer */}
      <div
        className="absolute inset-0 transition-colors duration-500 bg-gradient-to-b from-slate-100/90 via-[#F4F6F8]/88 to-[#F4F6F8]/95 dark:from-slate-950/80 dark:via-slate-950/75 dark:to-slate-950/90"
        style={overlayOpacity !== undefined ? { opacity: overlayOpacity } : undefined}
      />

      {/* 3. Decorative Subtle Tech Grid */}
      {withGrid && (
        <div
          className="absolute inset-0 transition-opacity duration-500 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:24px_24px] opacity-15 dark:bg-grid-cyber dark:opacity-15"
        />
      )}

      {/* 4. Atmospheric Glowing Orbs */}
      {withOrbs && image !== 'none' && (
        <div className="absolute inset-0 overflow-hidden">
          <div
            className={cn(
              'absolute -top-32 -right-32 size-[460px] rounded-full blur-[140px] transition-colors duration-700',
              activeVariant === 'dark' ? 'opacity-25' : 'opacity-10',
              orbTone === 'indigo' && 'bg-indigo-500',
              orbTone === 'cyan' && 'bg-cyan-500',
              orbTone === 'purple' && 'bg-purple-600',
              orbTone === 'amber' && 'bg-amber-500',
            )}
          />
          <div
            className={cn(
              'absolute top-1/2 -left-36 size-[400px] rounded-full bg-blue-600 blur-[130px]',
              activeVariant === 'dark' ? 'opacity-20' : 'opacity-10',
            )}
          />
          <div
            className={cn(
              'absolute -bottom-32 right-1/4 size-[440px] rounded-full bg-violet-600 blur-[140px]',
              activeVariant === 'dark' ? 'opacity-20' : 'opacity-10',
            )}
          />
        </div>
      )}
    </div>
  );
}

