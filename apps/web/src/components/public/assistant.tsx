'use client';

import { MessageCircle, Send, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WinnersCreekLogo } from '@/components/ui/WinnersCreekLogo';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface AssistantAnswer {
  question: string;
  answer: string;
  grounded: boolean;
  courses: { id: string; title: string; slug: string }[];
  escalation?: { available: boolean; message?: string; href?: string };
}

/**
 * Public AI assistant (§6). It only answers from the real course catalogue: when the backend
 * cannot ground an answer it says so and offers a human instead of inventing one.
 */
export function HomeAssistant() {
  const [open, setOpen] = React.useState(false);
  const [question, setQuestion] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [thread, setThread] = React.useState<AssistantAnswer[]>([]);
  const [failed, setFailed] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [thread, pending]);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || pending) return;
    setPending(true);
    setFailed(false);
    setQuestion('');
    try {
      const response = await api.post('/home/assistant', { question: asked });
      setThread((current) => [...current, { ...response.data, question: asked }]);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="home-assistant"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-indigo px-4 py-3 text-sm font-semibold text-white shadow-pop transition-transform hover:scale-[1.02]"
      >
        {open ? <X className="size-4" aria-hidden /> : <MessageCircle className="size-4" aria-hidden />}
        {open ? 'Close' : 'Ask about Winners Creek'}
      </button>

      <div
        id="home-assistant"
        hidden={!open}
        className="fixed bottom-[76px] right-5 z-40 flex max-h-[70vh] w-[min(360px,calc(100vw-40px))] flex-col overflow-hidden rounded-card border border-line bg-card shadow-pop"
      >
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
          <WinnersCreekLogo variant="compact" />
          <p className="text-xs font-semibold text-ink-2">Assistant</p>
        </div>

        <div className="scroll-thin flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5">
          <p className="text-sm text-ink-2">
            Ask about the programs, how practice sessions work, or how to get an account. Answers
            come from the live course catalogue — nothing is made up.
          </p>
          {thread.map((entry, index) => (
            <div key={index} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] rounded-[12px] rounded-br-[4px] bg-indigo px-3 py-2 text-sm text-white">
                {entry.question}
              </p>
              <div className="w-fit max-w-[92%] rounded-[12px] rounded-bl-[4px] bg-app px-3 py-2">
                <p className="text-sm text-ink-1">{entry.answer}</p>
                {entry.courses?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {entry.courses.map((course) => (
                      <li key={course.id}>
                        <Link
                          href={`/courses/${course.slug}`}
                          className="text-sm font-semibold text-indigo hover:underline"
                        >
                          {course.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {!entry.grounded && entry.escalation?.available && (
                  <p className="mt-2 text-xs text-ink-2">
                    {entry.escalation.message ?? 'A person can help with this.'}{' '}
                    <Link href={entry.escalation.href ?? '/contact'} className="font-semibold text-indigo hover:underline">
                      Contact the programme office
                    </Link>
                  </p>
                )}
              </div>
            </div>
          ))}
          {pending && <p className="text-xs text-ink-3">Checking the catalogue…</p>}
          {failed && (
            <p className="text-xs text-danger">
              The assistant is unavailable right now. Please try again, or{' '}
              <Link href="/contact" className="font-semibold underline">contact us</Link>.
            </p>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={ask} className={cn('flex items-center gap-2 border-t border-line-soft p-3')}>
          <label htmlFor="assistant-input" className="sr-only">Your question</label>
          <Input
            id="assistant-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="e.g. Do you have an interview prep course?"
          />
          <Button type="submit" variant="primary" size="icon" loading={pending} aria-label="Send question">
            <Send className="size-3.5" aria-hidden />
          </Button>
        </form>
      </div>
    </>
  );
}
