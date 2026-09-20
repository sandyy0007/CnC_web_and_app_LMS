'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/input';

/**
 * Destructive and state-changing actions are always confirmed, and where the requirements ask
 * for it the reason is captured with the confirmation (SRS §6.1).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  requireReason,
  reasonLabel = 'Reason',
  reasonHint,
  pending,
  error,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonHint?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void | Promise<void>;
  children?: React.ReactNode;
}) {
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const tooShort = requireReason && reason.trim().length < 3;

  React.useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogBody className="space-y-4">
          {children}
          {requireReason && (
            <Field
              label={reasonLabel}
              htmlFor="confirm-reason"
              required
              hint={reasonHint}
              error={touched && tooShort ? 'Please give a short reason (3+ characters)' : undefined}
            >
              <Textarea
                id="confirm-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={touched && tooShort}
                placeholder="This is recorded in the audit trail."
              />
            </Field>
          )}
          {error && (
            <p role="alert" className="rounded-[8px] bg-danger-bg px-3 py-2.5 text-base text-danger">
              {error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={pending}
            onClick={() => {
              setTouched(true);
              if (tooShort) return;
              void onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
