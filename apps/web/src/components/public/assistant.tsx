'use client';

import {
  ArrowRight,
  Bot,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface AssistantCourse {
  id: string;
  title: string;
  slug: string;
  category?: string;
  fee?: number;
}

interface AssistantAnswer {
  id: string;
  question: string;
  answer: string;
  grounded: boolean;
  courses?: AssistantCourse[];
  links?: { label: string; href: string }[];
  escalation?: { available: boolean; message?: string; href?: string; label?: string };
  provider?: string;
  createdAt: string;
}

const STARTER_PROMPTS = [
  'What is Winners Creek?',
  'What courses are available?',
  'How does practice & interview coaching work?',
];

/**
 * Floating Homepage AI Chatbot (§6).
 *
 * Stays hidden on initial page load as a floating widget in the bottom-right corner.
 * Clicking the launcher expands a responsive floating panel without obstructing navigation.
 * Preserves complete conversation history across open/close cycles and supports Escape-to-close.
 */
export function HomeAssistant() {
  const [open, setOpen] = React.useState(false);
  const [question, setQuestion] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [thread, setThread] = React.useState<AssistantAnswer[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = React.useState<string | null>(null);

  const launcherRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of conversation
  React.useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [thread, pending, open]);

  // Focus management: focus input on open, focus trigger button on close
  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else if (thread.length > 0) {
      launcherRef.current?.focus();
    }
  }, [open, thread.length]);

  // Keyboard navigation: Escape key closes the chat panel
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  async function submitQuestion(text: string) {
    const asked = text.trim();
    if (!asked || pending) return;

    setPending(true);
    setErrorMessage(null);
    setLastFailedQuestion(null);
    setQuestion('');

    try {
      const response = await api.post('/home/assistant', { question: asked });
      const data = response.data;
      const newEntry: AssistantAnswer = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        question: asked,
        answer: data.answer || 'I could not generate an answer at this time.',
        grounded: Boolean(data.grounded),
        courses: data.courses || [],
        links: data.links || [],
        escalation: data.escalation,
        provider: data.provider,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setThread((current) => [...current, newEntry]);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to reach the AI assistant. Please check your connection and try again.';
      setErrorMessage(message);
      setLastFailedQuestion(asked);
    } finally {
      setPending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    submitQuestion(question);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitQuestion(question);
    }
  }

  function handleRetry() {
    if (lastFailedQuestion) {
      submitQuestion(lastFailedQuestion);
    }
  }

  function handleClear() {
    setThread([]);
    setErrorMessage(null);
    setLastFailedQuestion(null);
  }

  return (
    <aside aria-label="AI Chatbot Widget" className="relative">
      {/* ---------------------------------------------------- Floating Trigger Button */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center">
        <div className="group relative">
          {/* Tooltip */}
          {!open && (
            <span
              role="tooltip"
              className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-800"
            >
              Chat with AI
              <span className="absolute left-full top-1/2 -ml-1 -translate-y-1/2 border-4 border-transparent border-l-slate-900/90 dark:border-l-slate-800" />
            </span>
          )}

          <button
            ref={launcherRef}
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-controls="home-assistant-panel"
            aria-label={open ? 'Close AI chat panel' : 'Chat with AI'}
            className={cn(
              'relative flex size-14 items-center justify-center rounded-full text-white shadow-2xl transition-all duration-300',
              'bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600',
              'hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/40',
              open ? 'rotate-90 bg-slate-800' : 'animate-bounce-subtle'
            )}
          >
            {open ? (
              <X className="size-6 transition-transform duration-200" aria-hidden />
            ) : (
              <>
                <Bot className="size-6 transition-transform duration-200 group-hover:scale-110" aria-hidden />
                <span className="absolute -top-1 -right-1 flex size-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- Floating Chatbot Panel */}
      <div
        id="home-assistant-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="Winners Creek AI Assistant"
        className={cn(
          'fixed bottom-24 right-4 sm:right-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out dark:border-white/10 dark:bg-slate-900/95',
          'w-[calc(100vw-32px)] sm:w-[400px] h-[550px] max-h-[calc(100dvh-120px)]',
          open
            ? 'scale-100 opacity-100 translate-y-0 pointer-events-auto'
            : 'pointer-events-none scale-95 opacity-0 translate-y-4'
        )}
      >
        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-white/5 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <Sparkles className="size-4" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  Winners Creek
                </p>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                  AI Live
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Grounded academic & course advisor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {thread.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear conversation history"
                title="Clear chat"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <RotateCcw className="size-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Conversation Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm scroll-thin">
          {/* Welcome Intro */}
          <div className="rounded-xl border border-indigo-50 bg-indigo-50/50 p-3.5 dark:border-indigo-950/40 dark:bg-indigo-950/20">
            <p className="text-xs font-medium leading-relaxed text-slate-700 dark:text-slate-300">
              👋 Hi! Ask me about our courses, 34 interactive skill games, practice interviews, or
              how the EEDI employability rubric works. All answers are grounded in real platform data.
            </p>
          </div>

          {/* Quick Starter Chips (shown when no messages yet) */}
          {thread.length === 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Suggested questions:
              </p>
              <div className="flex flex-col gap-1.5">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submitQuestion(prompt)}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
                  >
                    <span>{prompt}</span>
                    <ArrowRight className="size-3 text-slate-400" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message Thread */}
          {thread.map((entry) => (
            <div key={entry.id} className="space-y-2">
              {/* User Question */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-indigo-600 to-indigo-700 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm">
                  {entry.question}
                </div>
              </div>

              {/* Assistant Answer */}
              <div className="flex flex-col items-start gap-1">
                <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-slate-100 bg-slate-100/90 px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed text-slate-800 shadow-sm dark:border-white/5 dark:bg-slate-800/80 dark:text-slate-100">
                  <p className="whitespace-pre-line">{entry.answer}</p>

                  {/* Course Recommendations */}
                  {entry.courses && entry.courses.length > 0 && (
                    <div className="mt-3 border-t border-slate-200/60 pt-2.5 dark:border-slate-700/60">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Related Courses:
                      </p>
                      <ul className="mt-1.5 space-y-1.5">
                        {entry.courses.map((course) => (
                          <li key={course.id}>
                            <Link
                              href={`/courses/${course.slug}`}
                              className="group flex items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-600 shadow-xs transition-colors hover:bg-indigo-50 dark:bg-slate-900/60 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
                            >
                              <span className="truncate group-hover:underline">{course.title}</span>
                              <ArrowRight className="size-3 shrink-0 text-indigo-400 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Navigation Links */}
                  {entry.links && entry.links.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {entry.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/80"
                        >
                          <span>{link.label}</span>
                          <ArrowRight className="size-2.5" />
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Support Escalation */}
                  {entry.escalation?.available && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-slate-700/40 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{entry.escalation.message ?? 'Have questions about admissions or batch schedules?'} </span>
                      <Link
                        href={entry.escalation.href ?? '/contact'}
                        className="font-semibold text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
                      >
                        {entry.escalation.label ?? 'Contact programme office'}
                      </Link>
                    </div>
                  )}
                </div>
                <span className="pl-1 text-[10px] text-slate-400">{entry.createdAt}</span>
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {pending && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5 dark:bg-slate-800">
                <span className="size-1.5 animate-bounce rounded-full bg-indigo-600" />
                <span className="size-1.5 animate-bounce rounded-full bg-indigo-600 [animation-delay:0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-indigo-600 [animation-delay:0.4s]" />
              </div>
              <span className="text-[11px]">Consulting knowledge base…</span>
            </div>
          )}

          {/* Error Message with Retry */}
          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              <p className="font-medium">{errorMessage}</p>
              {lastFailedQuestion && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={pending}
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-red-800 underline hover:text-red-900 dark:text-red-200"
                >
                  <RotateCcw className="size-3" /> Retry question
                </button>
              )}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input Footer */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-100 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-slate-800/40"
        >
          <div className="flex items-end gap-2">
            <label htmlFor="home-assistant-input" className="sr-only">
              Ask AI assistant
            </label>
            <textarea
              ref={inputRef}
              id="home-assistant-input"
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={pending}
              placeholder="Ask about courses, games, or practice..."
              className={cn(
                'flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400',
                'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20',
                'disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800'
              )}
            />
            <Button
              type="submit"
              variant="primary"
              size="icon"
              loading={pending}
              disabled={pending || !question.trim()}
              aria-label="Send message"
              className="size-9 shrink-0 rounded-xl shadow-md"
            >
              <Send className="size-4" aria-hidden />
            </Button>
          </div>
          <p className="mt-1 text-center text-[10px] text-slate-400">
            Press <kbd className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[9px] dark:bg-slate-700">Enter</kbd> to send, <kbd className="rounded bg-slate-200 px-1 py-0.5 font-mono text-[9px] dark:bg-slate-700">Shift+Enter</kbd> for new line
          </p>
        </form>
      </div>
    </aside>
  );
}
