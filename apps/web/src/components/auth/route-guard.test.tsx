import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RouteGuard } from './route-guard';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

let authState: any = { status: 'idle', user: null };
vi.mock('@/store', () => ({
  useAppSelector: (selector: (state: any) => unknown) => selector({ auth: authState }),
  useAppDispatch: () => vi.fn(),
}));

function renderGuard(allow: any, state: any) {
  authState = state;
  replace.mockClear();
  return render(
    <RouteGuard allow={allow}>
      <p>secret content</p>
    </RouteGuard>,
  );
}

describe('RouteGuard', () => {
  it('renders the page for the allowed role', () => {
    renderGuard('HOD', {
      status: 'authenticated',
      user: { id: '1', role: 'HOD', home: '/hod/dashboard' },
    });
    expect(screen.getByText('secret content')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('never renders the page for a signed-out visitor, and sends them to sign in', () => {
    renderGuard('HOD', { status: 'anonymous', user: null });
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith(expect.stringContaining('/login?next='));
  });

  it('never renders the page for the wrong role, and sends them to their own portal', () => {
    renderGuard('HOD', {
      status: 'authenticated',
      user: { id: '2', role: 'STUDENT', home: '/student/dashboard' },
    });
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/student/dashboard');
  });

  it('shows a waiting state while the session is being restored', () => {
    renderGuard('HOD', { status: 'restoring', user: null });
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('accepts a list of roles', () => {
    renderGuard(['ADMIN', 'HOD'], {
      status: 'authenticated',
      user: { id: '3', role: 'ADMIN', home: '/admin/dashboard' },
    });
    expect(screen.getByText('secret content')).toBeInTheDocument();
  });
});
