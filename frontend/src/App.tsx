import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import Login from './pages/Login';
import Compose from './pages/Compose';
import Settings from './pages/Settings';
import EmailDetail from './pages/EmailDetail';
import { Sidebar } from './components/Sidebar';
import { EmailList } from './components/EmailList';
import { api } from './lib/api';
import { User, Email } from './types';

type Section = 'scheduled' | 'sent' | 'settings';

function AppInner() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState<Section>('scheduled');
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [compose, setCompose] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || section === 'settings') return;
    setLoading(true);
    try {
      setEmails(section === 'scheduled' ? await api.scheduled() : await api.sent());
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, [section, user]);

  useEffect(() => {
    api.me().then(setUser).catch(() => {}).finally(() => setChecking(false));
  }, []);
  useEffect(() => { void load(); }, [load]);

  function navigateSection(value: string) {
    if (value === 'scheduled' || value === 'sent' || value === 'settings') setSection(value);
    setCompose(false);
    setDetail(null);
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setEmails([]);
    setCompose(false);
    setDetail(null);
  }

  async function toggleStar(email: Email) {
    try {
      const updated = await api.setStarred(email.id, !email.isStarred);
      setEmails((current) => current.map((item) => item.id === email.id ? { ...item, isStarred: updated.isStarred } : item));
    } catch {
      // Keep the current list unchanged if the update could not be saved.
    }
  }

  if (checking) return <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>;
  if (!user) return <Login onLogin={() => api.me().then(setUser)} />;

  const sidebar = <Sidebar user={user} section={section} onSection={navigateSection} onCompose={() => { setDetail(null); setCompose(true); }} onLogout={() => { void logout(); }} />;

  if (compose) return <div className="flex min-h-screen">{sidebar}<Compose senders={user.senders ?? []} onDone={() => { setCompose(false); setSection('scheduled'); void load(); }} onBack={() => setCompose(false)} /></div>;
  if (detail) return <div className="flex min-h-screen">{sidebar}<EmailDetail id={detail} onBack={() => setDetail(null)} /></div>;
  return <div className="flex min-h-screen">{sidebar}{section === 'settings' ? <Settings /> : <EmailList mode={section} emails={emails} loading={loading} onRefresh={() => { void load(); }} onOpen={setDetail} onToggleStar={(email) => { void toggleStar(email); }} onSearch={async (query) => {
    if (!query.trim()) { await load(); return; }
    setLoading(true);
    try { setEmails(await api.search(query)); } finally { setLoading(false); }
  }} />}</div>;
}

export default function App() { return <BrowserRouter><AppInner /></BrowserRouter>; }
