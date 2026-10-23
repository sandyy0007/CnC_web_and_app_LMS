import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

describe('Shared Dialog Component', () => {
  it('renders dialog overlay and content when open', () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock Lifetime Access</DialogTitle>
            <DialogDescription>Course enrollment modal description</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p>Body payment form content</p>
          </DialogBody>
          <DialogFooter>
            <button>Confirm</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    const title = screen.getByText('Unlock Lifetime Access');
    expect(title).toBeInTheDocument();

    const desc = screen.getByText('Course enrollment modal description');
    expect(desc).toBeInTheDocument();

    const bodyText = screen.getByText('Body payment form content');
    expect(bodyText).toBeInTheDocument();
  });

  it('ensures content has fixed positioning and z-[51] above overlay z-50', () => {
    const { container } = render(
      <Dialog open={true}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Stacking Context Verification</DialogTitle>
            <DialogDescription>Description for screen readers</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    const dialogContent = screen.getByRole('dialog');
    expect(dialogContent).toBeInTheDocument();

    // Must be fixed positioned and z-[51] to prevent overlay occlusion or scroll displacement
    expect(dialogContent.className).toContain('fixed');
    expect(dialogContent.className).toContain('z-[51]');
    expect(dialogContent.className).toContain('-translate-x-1/2');
    expect(dialogContent.className).toContain('-translate-y-1/2');

    // Must NOT have surface-3d which sets position: relative and breaks centering
    expect(dialogContent.className).not.toContain('surface-3d');
  });

  it('triggers onOpenChange when close button is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Close Action</DialogTitle>
            <DialogDescription>Test description</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    const closeBtn = screen.getByRole('button', { name: /close/i });
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not render overlay or content when open is false', () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hidden Modal</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    expect(screen.queryByText('Hidden Modal')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
