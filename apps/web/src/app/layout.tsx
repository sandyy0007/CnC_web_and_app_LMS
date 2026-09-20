import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';

import { GlobalBackgroundProvider } from '@/components/ui/GlobalBackgroundLayer';
import { StoreProvider } from '@/store/provider';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="relative min-h-screen antialiased selection:bg-indigo-500/30 selection:text-white">
        <StoreProvider>
          <GlobalBackgroundProvider>
            <div className="relative z-10 flex min-h-screen flex-col">
              {children}
            </div>
            <Toaster
              position="top-right"
              toastOptions={{ style: { fontSize: '13px', borderRadius: '10px' } }}
            />
          </GlobalBackgroundProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
