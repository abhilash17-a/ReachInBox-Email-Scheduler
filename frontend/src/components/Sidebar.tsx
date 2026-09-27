import { useEffect, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, LogOut, Plus, Send, Settings } from 'lucide-react';
import { User } from '../types';

type SidebarProps = {
  user: User;
  section: string;
  onSection: (section: string) => void;
  onCompose: () => void;
  onLogout: () => void;
};

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export function Sidebar({ user, section, onSection, onCompose, onLogout }: SidebarProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileOpen]);

  function openSettings() {
    setProfileOpen(false);
    onSection('settings');
  }

  return <aside className="w-[248px] shrink-0 border-r border-slate-100 bg-white p-4">
    <div className="flex items-center justify-between px-3 py-2"><div className="text-[28px] font-black tracking-[-3px]">ONB</div></div>
    <div className="relative mt-1" ref={profileRef}>
      <button type="button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen((open) => !open)} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        {user.avatarUrl ? <img className="h-9 w-9 rounded-full object-cover" src={user.avatarUrl} alt={`${user.name} Google profile`} referrerPolicy="no-referrer" /> : <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">{initials(user.name)}</span>}
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{user.name}</span><span className="block truncate text-[10px] text-slate-400">{user.email}</span></span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
      </button>
      {profileOpen && <div role="menu" aria-label="Profile menu" className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
        <div className="flex items-center gap-3 border-b border-slate-100 px-2 pb-3 pt-1">
          {user.avatarUrl ? <img className="h-10 w-10 rounded-full object-cover" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">{initials(user.name)}</span>}
          <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{user.name}</span><span className="block truncate text-xs text-slate-500">{user.email}</span></span>
        </div>
        <button role="menuitem" type="button" onClick={openSettings} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"><Settings size={16}/> Settings</button>
        <button role="menuitem" type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"><LogOut size={16}/> Log out</button>
      </div>}
    </div>
    <button onClick={onCompose} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-brand py-2 text-sm font-medium text-brand hover:bg-emerald-50"><Plus size={16}/> Compose</button>
    <div className="mt-7 px-3 text-[10px] uppercase tracking-widest text-slate-400">Core</div>
    <nav aria-label="Email folders" className="mt-2 space-y-1">
      <button onClick={() => onSection('scheduled')} aria-current={section === 'scheduled' ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${section === 'scheduled' ? 'bg-emerald-50 text-slate-800' : 'text-slate-600 hover:bg-slate-50'}`}><CalendarClock size={17}/><span className="flex-1 text-left">Scheduled</span></button>
      <button onClick={() => onSection('sent')} aria-current={section === 'sent' ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${section === 'sent' ? 'bg-emerald-50 text-slate-800' : 'text-slate-600 hover:bg-slate-50'}`}><Send size={17}/><span className="flex-1 text-left">Sent</span></button>
    </nav>
  </aside>;
}
