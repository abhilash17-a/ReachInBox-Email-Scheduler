import { useState } from 'react';
import { api, API } from '../lib/api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function demo() {
    setLoading(true);
    setError('');
    try { await api.demoLogin(); await onLogin(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open the local demo account.'); }
    finally { setLoading(false); }
  }

  return <div className="flex min-h-screen items-center justify-center bg-white px-5">
    <div className="w-full max-w-[492px] rounded-2xl border border-slate-200 bg-white px-10 py-12 shadow-sm">
      <h1 className="text-center text-[40px] font-bold tracking-tight">Login</h1>
      <a href={`${API}/api/auth/google`} className="mt-7 flex h-12 items-center justify-center gap-3 rounded-xl bg-[#e6f7ed] text-base text-slate-700 hover:bg-[#dcf3e5]"><span aria-hidden="true" className="font-bold text-blue-500">G</span> Continue with Google</a>
      <p className="mt-3 text-center text-xs text-slate-400">Sign in with Google to use your name, email, and Google profile photo.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {import.meta.env.DEV && <>
        <div className="my-6 flex items-center gap-4 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200"/><span>Local development</span><span className="h-px flex-1 bg-slate-200"/></div>
        <button disabled={loading} onClick={() => { void demo(); }} className="h-11 w-full rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60">{loading ? 'Opening demo…' : 'Use local demo account'}</button>
        <p className="mt-3 text-center text-[11px] text-slate-400">The local demo uses sample profile details. Choose Google above for your account.</p>
      </>}
    </div>
  </div>;
}
