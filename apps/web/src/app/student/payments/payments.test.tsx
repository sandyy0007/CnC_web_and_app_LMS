import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { ThemeProvider } from '@/lib/theme/ThemeContext';
import { GlobalBackgroundProvider } from '@/components/ui/GlobalBackgroundLayer';
import { Provider as TooltipProvider } from '@radix-ui/react-tooltip';

// Mock dependencies
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/student/payments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/hooks/useApi', () => ({
  useApi: (url: string) => {
    if (url === '/student/payments') {
      return {
        data: [
          {
            id: 'pay-1',
            courseId: 'course-cloud-ai',
            courseTitle: 'Cloud AI Masterclass (Online)',
            amount: 3999,
            currency: 'INR',
            status: 'verified',
            courseMode: 'ONLINE',
          },
        ],
        refetch: vi.fn(),
      };
    }
    if (url === '/student/trials') {
      return {
        data: [
          {
            id: 'trial-1',
            courseId: 'course-cloud-ai',
            courseTitle: 'Cloud AI Masterclass (Online)',
            courseName: 'Cloud AI Masterclass (Online)',
            status: 'converted',
            isActive: false,
            isPaid: true,
            daysRemaining: 0,
            startedAt: '2026-10-18T00:00:00Z',
            expiresAt: '2026-10-21T00:00:00Z',
          },
        ],
        refetch: vi.fn(),
      };
    }
    return { data: null, refetch: vi.fn() };
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import StudentPaymentsPage from './page';

describe('StudentPaymentsPage Payment Status and Access Verification', () => {
  it('displays Paid & Enrolled badge and does not display Purchase Course button for verified course', () => {
    render(
      <ThemeProvider>
        <GlobalBackgroundProvider>
          <TooltipProvider>
            <StudentPaymentsPage />
          </TooltipProvider>
        </GlobalBackgroundProvider>
      </ThemeProvider>
    );

    // Check title in trial card
    expect(screen.getAllByText('Cloud AI Masterclass (Online)').length).toBeGreaterThan(0);

    // Verify Paid & Enrolled badge is shown
    expect(screen.getByText('Paid & Enrolled')).toBeDefined();

    // Verify that Purchase Course or Unlock Lifetime Access button is NOT displayed
    expect(screen.queryByRole('button', { name: /Purchase Course/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Unlock Lifetime Access/i })).toBeNull();

    // Verify Open Course link is present
    expect(screen.getByRole('link', { name: /Open Course →/i })).toBeDefined();
  });
});

