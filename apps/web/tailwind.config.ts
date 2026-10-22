import type { Config } from 'tailwindcss';

/**
 * One EEDI design system for all four portals. Every colour is a CSS variable declared in
 * `globals.css`, lifted verbatim from the supplied Admin Portal UI Showcase so the portals
 * cannot drift apart.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: 'var(--navy-950)',
          900: 'var(--navy-900)',
          800: 'var(--navy-800)',
        },
        indigo: {
          DEFAULT: 'var(--indigo)',
          600: 'var(--indigo-600)',
          100: 'var(--indigo-100)',
          50: 'var(--indigo-50)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          dark: 'var(--amber-dark)',
          50: 'var(--amber-50)',
        },
        app: 'var(--bg-app)',
        card: {
          DEFAULT: 'var(--card)',
          border: 'var(--card-border)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          elevated: 'var(--surface-elevated)',
          muted: 'var(--surface-muted)',
          glass: 'var(--surface-glass)',
          hover: 'var(--surface-hover)',
        },
        sidebar: 'var(--sidebar-background)',
        header: 'var(--header-background)',
        input: {
          DEFAULT: 'var(--input-background)',
          border: 'var(--input-border)',
          focus: 'var(--input-focus)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
        },
        line: {
          DEFAULT: 'var(--border)',
          soft: 'var(--border-soft)',
          subtle: 'var(--border-subtle)',
        },
        ink: { 1: 'var(--text-1)', 2: 'var(--text-2)', 3: 'var(--text-3)' },
        success: { DEFAULT: 'var(--success)', bg: 'var(--success-bg)' },
        danger: { DEFAULT: 'var(--danger)', bg: 'var(--danger-bg)' },
        info: { DEFAULT: 'var(--info)', bg: 'var(--info-bg)' },
        purple: { DEFAULT: 'var(--purple)', bg: 'var(--purple-bg)' },
        teal: { DEFAULT: 'var(--teal)', bg: 'var(--teal-bg)' },
      },
      borderRadius: { card: 'var(--radius-card)', sm: 'var(--radius-sm)' },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        pop: 'var(--shadow-pop)',
        '3d-card': 'var(--shadow-3d-card)',
        '3d-hover': 'var(--shadow-3d-hover)',
        '3d-pop': 'var(--shadow-3d-pop)',
        glow: '0 0 24px -4px rgba(75, 63, 228, 0.25)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Source Serif 4', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['11px', '15px'],
        xs: ['12px', '16px'],
        sm: ['13px', '18px'],
        base: ['14px', '21px'],
        md: ['15px', '22px'],
        lg: ['17px', '24px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['30px', '38px'],
        '4xl': ['36px', '44px'],
        '5xl': ['48px', '56px'],
        hero: ['clamp(2.4rem, 4.8vw, 4.25rem)', '1.12'],
        display: ['clamp(1.85rem, 3.5vw, 2.75rem)', '1.2'],
      },
      keyframes: {
        fade: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        fadeInUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        pulseSlow: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
        float: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        fade: 'fade .25s ease',
        'fade-in-up': 'fadeInUp .35s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn .2s ease-out',
        'pulse-slow': 'pulseSlow 3s ease-in-out infinite',
        float: 'float 5s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'accordion-down': 'accordion-down .2s ease-out',
        'accordion-up': 'accordion-up .2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
