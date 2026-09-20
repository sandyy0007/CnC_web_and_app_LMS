'use client';

import { CalendarDays } from 'lucide-react';
import * as React from 'react';

import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

export default function AnnouncementsPage() {
  const [kind, setKind] = React.useState('all');
  const query = useApi<{ items: any[]; kinds: string[] }>(
    '/home/announcements',
    { kind, limit: 30 },
    { select: (raw) => ({ items: raw.data, kinds: raw.meta?.kinds ?? [] }) },
  );
  // Keep the full tab list even after filtering narrows the response's `meta.kinds`.
  const [kinds, setKinds] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (kind === 'all' && query.data?.kinds?.length) setKinds(query.data.kinds);
  }, [kind, query.data]);

  return (
    <div className="mx-auto max-w-[920px] px-5 py-12 animate-enter">
      <h1 className="font-serif heading-section font-semibold tracking-tight text-ink-1">
        Announcements
      </h1>
      <p className="mt-3 text-base sm:text-lg text-ink-2">
        Public notices from the programme office. Batch-specific notices appear inside your portal.
      </p>

      <div className="mt-6 flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
        {['all', ...kinds].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setKind(item)}
            aria-pressed={kind === item}
            className={cn(
              'tactile-press rounded-full border px-3 py-1.5 text-sm font-semibold capitalize transition-all duration-150',
              kind === item
                ? 'border-indigo bg-indigo text-white shadow-xs'
                : 'border-white/15 bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white',
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <AsyncSection query={query} skeleton="cards" isEmpty={(data) => data.items.length === 0}>
          {(data) => (
            <div className="space-y-3.5">
              {data.items.map((item) => (
                <Card key={item.id} className="card-interactive">
                  <CardBody className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info" className="capitalize">
                        {item.kind}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-ink-3">
                        <CalendarDays className="size-3.5" aria-hidden />
                        {formatDate(item.publishedAt)}
                      </span>
                      {item.author && <span className="text-xs text-ink-3">· {item.author}</span>}
                    </div>
                    <h2 className="mt-3 text-md font-semibold">{item.title}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{item.body}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </AsyncSection>
      </div>
    </div>
  );
}
