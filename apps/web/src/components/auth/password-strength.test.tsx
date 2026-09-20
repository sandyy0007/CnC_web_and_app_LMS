import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PASSWORD_RULES, PasswordStrength, passwordScore } from './password-strength';

describe('password policy mirror', () => {
  it('scores nothing for an empty password', () => {
    expect(passwordScore('')).toBe(0);
  });

  it('rises as each rule is satisfied', () => {
    expect(passwordScore('short')).toBeLessThan(passwordScore('Longer1!'));
    expect(passwordScore('WinnersCreek@2026')).toBe(4);
  });

  it('matches the rules the backend enforces', () => {
    // Same five rules as `app/core/security.py::PASSWORD_RULES`.
    expect(PASSWORD_RULES).toHaveLength(5);
    expect(PASSWORD_RULES.every((rule) => rule.test('WinnersCreek@2026'))).toBe(true);
    expect(PASSWORD_RULES.filter((rule) => rule.test('password')).length).toBeLessThan(5);
  });

  it('tells the user which rules are still unmet', () => {
    render(<PasswordStrength value="password" />);
    expect(screen.getByText('One uppercase letter')).toBeInTheDocument();
    expect(screen.getByText('One number')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/password strength/i);
  });

  it('says nothing at all before the user types', () => {
    render(<PasswordStrength value="" />);
    expect(screen.queryByText('One uppercase letter')).not.toBeInTheDocument();
  });
});
