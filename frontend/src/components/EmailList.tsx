import { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, RefreshCw, Search, SlidersHorizontal, Star } from 'lucide-react';
import { Email } from '../types';
import { StatusPill } from './StatusPill';

type Mode = 'scheduled' | 'sent';
type StatusFilter = 'ALL' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED';

const timeOnly = (value: string) => new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateAndTime = (value?: string | null) => value ? new Date(value).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export function EmailList({ mode, emails, loading, onRefresh, onOpen, onSearch, onToggleStar }: {
  mode: Mode;
  emails: Email[];
  loading: boolean;
  onRefresh: () => void;
  onOpen: (id: string) => void;
  onSearch?: (query: string) => void;
  onToggleStar?: (email: Email) => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const filterRef = useRef<HTMLDivElement>(null);
  const options: Array<{ value: StatusFilter; label: string }> = mode === 'scheduled'
    ? [{ value: 'ALL', label: 'All scheduled' }, { value: 'SCHEDULED', label: 'Scheduled' }, { value: 'PROCESSING', label: 'Processing' }]
    : [{ value: 'ALL', label: 'All sent' }, { value: 'SENT', label: 'Sent' }, { value: 'FAILED', label: 'Failed' }];

  const visibleEmails = useMemo(() => statusFilter === 'ALL' ? emails : emails.filter((email) => email.status === statusFilter), [emails, statusFilter]);

  useEffect(() => {
    if (!filterOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filterOpen]);

  function toggleFilter() {
    setFilterOpen((open) => !open);
  }

  return <div className="flex min-w-0 flex-1 flex-col">
    <div className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-6">
      <div className="flex h-10 max-w-[520px] flex-1 items-center gap-2 rounded-full bg-slate-50 px-4 text-sm text-slate-400"><Search size={16}/><input aria-label="Search emails" onKeyDown={(event) => { if (event.key === 'Enter') onSearch?.(event.currentTarget.value); }} className="w-full bg-transparent outline-none" placeholder="Search" /></div>
      <div className="relative" ref={filterRef}>
        <button type="button" aria-label="Filter emails" aria-expanded={filterOpen} aria-haspopup="menu" title={options.find((option) => option.value === statusFilter)?.label} onClick={toggleFilter} className={`rounded-full p-2 hover:bg-slate-50 ${statusFilter === 'ALL' ? 'text-slate-400' : 'bg-emerald-50 text-emerald-700'}`}><SlidersHorizontal size={16}/></button>
        {filterOpen && <div role="menu" aria-label="Filter by status" className="absolute right-0 top-full z-20 mt-2 min-w-44 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">{options.map((option) => <button role="menuitemradio" aria-checked={statusFilter === option.value} type="button" key={option.value} onClick={() => { setStatusFilter(option.value); setFilterOpen(false); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${statusFilter === option.value ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'}`}>{option.label}</button>)}</div>}
      </div>
      <button type="button" aria-label="Refresh email list" onClick={onRefresh} className="rounded-full p-2 text-slate-400 hover:bg-slate-50"><RefreshCw size={16}/></button>
    </div>
    <div className="border-b border-slate-100 px-7 py-3 text-[11px] font-semibold text-slate-400">{mode === 'scheduled' ? 'SCHEDULED EMAILS' : 'SENT EMAILS'}</div>
    <div className="scrollbar flex-1 overflow-auto">
      {loading ? <div className="space-y-2 p-5">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-50" />)}</div>
        : visibleEmails.length === 0 ? <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center"><Mail className="text-slate-300" size={34}/><div className="mt-3 text-sm font-medium text-slate-600">{emails.length ? 'No emails match this filter' : `No ${mode} emails`}</div><div className="mt-1 text-xs text-slate-400">{emails.length ? 'Choose another status filter to see more emails.' : `Your ${mode} emails will appear here.`}</div></div>
          : visibleEmails.map((email) => <div key={email.id} className="flex items-center border-b border-slate-100 px-3 hover:bg-slate-50 sm:px-7">
            <button type="button" onClick={() => onOpen(email.id)} className="flex min-w-0 flex-1 items-center gap-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <div className="w-[160px] shrink-0 truncate text-xs text-slate-700">To: <span className="font-medium">{email.recipient}</span></div>
              <StatusPill status={email.status} label={mode === 'scheduled' && email.status === 'SCHEDULED' ? `Scheduled at ${timeOnly(email.scheduledAt)}` : undefined}/>
              <div className="min-w-0 flex-1 truncate text-sm"><span className="font-medium text-slate-700">{email.subject}</span><span className="ml-2 text-slate-400">– {email.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 100)}</span></div>
              <div className="shrink-0 text-xs text-slate-400">{dateAndTime(mode === 'scheduled' ? email.scheduledAt : email.sentAt)}</div>
            </button>
            <button type="button" aria-label={email.isStarred ? 'Remove star' : 'Star email'} aria-pressed={Boolean(email.isStarred)} onClick={() => onToggleStar?.(email)} className="shrink-0 rounded p-1 text-slate-300 hover:text-amber-500"><Star size={16} fill={email.isStarred ? 'currentColor' : 'none'} className={email.isStarred ? 'text-amber-500' : ''}/></button>
          </div>)}
    </div>
  </div>;
}
