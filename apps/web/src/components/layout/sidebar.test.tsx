import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Sidebar } from './sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/hod/participants',
}));

const dispatch = vi.fn();
vi.mock('@/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: any) => unknown) =>
    selector({ ui: { sidebarOpen: false }, auth: { user: null } }),
}));

const hod = {
  id: '1',
  name: 'Priya Kulkarni',
  role: 'HOD',
  roleLabel: 'Head of Department',
  collegeName: 'ABC Engineering College',
  departmentName: 'Computer Science',
  home: '/hod/dashboard',
} as any;

describe('portal sidebar', () => {
  it('marks the current page for assistive technology', () => {
    render(<Sidebar user={hod} open onClose={() => {}} />);
    const current = screen.getByRole('link', { current: 'page' });
    expect(current).toHaveTextContent('Participants');
  });

  it('renders locked scope items as non-interactive, with the reason readable', () => {
    render(<Sidebar user={hod} open onClose={() => {}} />);
    // "Other Departments" must never be a link — it is refused server-side too.
    expect(screen.queryByRole('link', { name: /other departments/i })).not.toBeInTheDocument();
    expect(screen.getByText('Other Departments')).toBeInTheDocument();
    expect(
      screen.getAllByText(/not rendered; also blocked server-side/i).length,
    ).toBeGreaterThan(0);
  });

  it('shows the HOD their scope so the boundary is never a guess', () => {
    render(<Sidebar user={hod} open onClose={() => {}} />);
    expect(screen.getByText(/data isolation active/i)).toBeInTheDocument();
  });

  it('gives a student their own navigation and none of the staff routes', () => {
    render(
      <Sidebar
        user={{ ...hod, role: 'STUDENT', roleLabel: 'Student', home: '/student/dashboard' }}
        open
        onClose={() => {}}
      />,
    );
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: /practice/i })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /evaluations/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /audit/i })).not.toBeInTheDocument();
  });
});
