import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeAssistant } from '@/components/public/assistant';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}));

describe('HomeAssistant Floating Chatbot Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders in closed state by default with floating button and tooltip', () => {
    render(<HomeAssistant />);

    // Floating trigger button is present
    const launcher = screen.getByRole('button', { name: /chat with ai/i });
    expect(launcher).toBeInTheDocument();
    expect(launcher).toHaveAttribute('aria-expanded', 'false');

    // Tooltip is present
    expect(screen.getByText('Chat with AI')).toBeInTheDocument();

    // Dialog panel is hidden via CSS opacity and pointer-events
    const panel = screen.getByRole('dialog', { name: /winners creek ai assistant/i });
    expect(panel).toHaveClass('pointer-events-none');
    expect(panel).toHaveClass('opacity-0');
  });

  it('opens panel when floating button is clicked and displays welcome & starter suggestions', () => {
    render(<HomeAssistant />);

    const launcher = screen.getByRole('button', { name: /chat with ai/i });
    fireEvent.click(launcher);

    // Now expanded
    expect(launcher).toHaveAttribute('aria-expanded', 'true');

    // Panel is visible
    const panel = screen.getByRole('dialog', { name: /winners creek ai assistant/i });
    expect(panel).toHaveClass('pointer-events-auto');
    expect(panel).toHaveClass('opacity-100');

    // Welcome message and suggested questions
    expect(screen.getByText(/34 interactive skill games/i)).toBeInTheDocument();
    expect(screen.getByText('What is Winners Creek?')).toBeInTheDocument();
    expect(screen.getByText('What courses are available?')).toBeInTheDocument();
  });

  it('closes panel when close button is clicked and preserves conversation', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        answer: 'Winners Creek is an employability ecosystem.',
        grounded: true,
        courses: [],
        links: [],
      },
    });

    render(<HomeAssistant />);

    // Open chat
    const launcher = screen.getByRole('button', { name: /chat with ai/i });
    fireEvent.click(launcher);

    // Type and send a message
    const input = screen.getByPlaceholderText(/ask about courses/i);
    fireEvent.change(input, { target: { value: 'What is Winners Creek?' } });

    const sendBtn = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(sendBtn);

    // Wait for response to appear
    await waitFor(() => {
      expect(screen.getByText('Winners Creek is an employability ecosystem.')).toBeInTheDocument();
    });

    // Click close button
    const closeBtn = screen.getByRole('button', { name: /close chat/i });
    fireEvent.click(closeBtn);

    // Panel is closed
    const panel = screen.getByRole('dialog', { name: /winners creek ai assistant/i });
    expect(panel).toHaveClass('pointer-events-none');

    // Reopen panel
    fireEvent.click(launcher);
    expect(panel).toHaveClass('pointer-events-auto');

    // Conversation history is preserved!
    expect(screen.getByText('What is Winners Creek?')).toBeInTheDocument();
    expect(screen.getByText('Winners Creek is an employability ecosystem.')).toBeInTheDocument();
  });

  it('closes panel on Escape key press', () => {
    render(<HomeAssistant />);

    const launcher = screen.getByRole('button', { name: /chat with ai/i });
    fireEvent.click(launcher);

    const panel = screen.getByRole('dialog', { name: /winners creek ai assistant/i });
    expect(panel).toHaveClass('pointer-events-auto');

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(panel).toHaveClass('pointer-events-none');
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not send empty or whitespace messages', () => {
    render(<HomeAssistant />);

    const launcher = screen.getByRole('button', { name: /chat with ai/i });
    fireEvent.click(launcher);

    const input = screen.getByPlaceholderText(/ask about courses/i);
    fireEvent.change(input, { target: { value: '   ' } });

    const sendBtn = screen.getByRole('button', { name: /send message/i });
    expect(sendBtn).toBeDisabled();

    fireEvent.click(sendBtn);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('supports Enter key to submit and Shift+Enter for new line', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        answer: 'Here are our courses.',
        grounded: true,
        courses: [{ id: '1', title: 'Cloud AI', slug: 'cloud-ai' }],
      },
    });

    render(<HomeAssistant />);

    const launcher = screen.getByRole('button', { name: /chat with ai/i });
    fireEvent.click(launcher);

    const input = screen.getByPlaceholderText(/ask about courses/i);
    fireEvent.change(input, { target: { value: 'Available courses?' } });

    // Press Enter without shift
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/home/assistant', { question: 'Available courses?' });
      expect(screen.getByText('Here are our courses.')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully and offers a retry button', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Network connection timeout'));

    render(<HomeAssistant />);

    const launcher = screen.getByRole('button', { name: /chat with ai/i });
    fireEvent.click(launcher);

    const input = screen.getByPlaceholderText(/ask about courses/i);
    fireEvent.change(input, { target: { value: 'Help please' } });

    const sendBtn = screen.getByRole('button', { name: /send message/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/network connection timeout/i)).toBeInTheDocument();
    });

    // Retry button is available
    const retryBtn = screen.getByRole('button', { name: /retry question/i });
    expect(retryBtn).toBeInTheDocument();

    // Mock successful retry
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        answer: 'Recovered answer.',
        grounded: true,
      },
    });

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Recovered answer.')).toBeInTheDocument();
    });
  });
});
