'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const id = React.useId();

  // Debounced so typing doesn't fire a request per keystroke.
  React.useEffect(() => setDraft(value), [value]);
  React.useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 280);
    return () => clearTimeout(timer);
  }, [draft, onChange, value]);

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label ?? placeholder}
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3"
        aria-hidden
      />
      <Input
        id={id}
        type="search"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        className="pl-9 pr-8"
      />
      {draft && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-1"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

export interface FilterDefinition {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** Shown when nothing is selected, e.g. "Batch: All". */
  allLabel?: string;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters = [],
  values = {},
  onFilterChange,
  onReset,
  actions,
  className,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDefinition[];
  values?: Record<string, string>;
  onFilterChange?: (name: string, value: string) => void;
  onReset?: () => void;
  actions?: React.ReactNode;
  className?: string;
}) {
  const active = filters.filter((filter) => values[filter.name] && values[filter.name] !== 'all');

  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-2.5', className)}>
      {onSearchChange && (
        <SearchInput
          value={search ?? ''}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className="min-w-[220px] flex-1 sm:max-w-[320px]"
        />
      )}

      {filters.map((filter) => (
        <Select
          key={filter.name}
          value={values[filter.name] ?? 'all'}
          onValueChange={(value) => onFilterChange?.(filter.name, value)}
        >
          <SelectTrigger aria-label={filter.label} className="w-auto min-w-[130px]">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{filter.allLabel ?? `${filter.label}: All`}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {active.length > 0 && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <SlidersHorizontal aria-hidden />
          Clear {active.length} filter{active.length > 1 ? 's' : ''}
        </Button>
      )}

      {actions && <div className="ml-auto flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
