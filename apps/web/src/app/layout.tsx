import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';

import { GlobalBackgroundProvider } from '@/components/ui/GlobalBackgroundLayer';
import { StoreProvider } from '@/store/provider';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import '@/styles/globals.css';

/**
 * Typography is declared in `globals.css` rather than fetched from a font CDN at build time.
 */

export const metadata: Metadata = {
  title: {
    default: 'Winners Creek — Learning & Education Platform',
    template: '%s · Winners Creek',
  },
  description:
    'Winners Creek is a modern learning platform connecting participants, trainers, colleges and digital learning experiences.',
  robots: { index: true, follow: true },
  applicationName: 'Winners Creek',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0f19',
};

const themeAntiFlashScript = `
(function() {
  try {
    var stored = localStorage.getItem('wc_theme') || localStorage.getItem('winnerscreek-theme');
    var isDark = stored ? stored === 'dark' : true;
    var root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeAntiFlashScript }} />
      </head>
      <body className="relative min-h-screen antialiased selection:bg-indigo-500/30 selection:text-white bg-app text-ink-1">
        <StoreProvider>
          <ThemeProvider>
            <GlobalBackgroundProvider>
              <div className="relative z-10 flex min-h-screen flex-col">
                {children}
              </div>
              <Toaster
                position="top-right"
                toastOptions={{ style: { fontSize: '13px', borderRadius: '10px' } }}
              />
            </GlobalBackgroundProvider>
          </ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
