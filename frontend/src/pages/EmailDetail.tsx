import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clipboard, Download, MoreHorizontal, Paperclip, Star, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { StatusPill } from '../components/StatusPill';

type Attachment = { filename: string; contentType: string; contentBase64: string };
type EmailDetails = {
  id: string;
  subject: string;
  recipient: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  previewUrl?: string | null;
  error?: string | null;
  isStarred?: boolean;
  sender?: { email?: string; displayName?: string | null };
  campaign?: { attachments?: Attachment[] };
};

const formatDateTime = (value: string) => new Date(value).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const safeHeader = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

function createEml(email: EmailDetails) {
  const boundary = `reachinbox-${crypto.randomUUID()}`;
  const senderName = safeHeader(email.sender?.displayName || email.sender?.email || 'Sender');
  const senderEmail = safeHeader(email.sender?.email || '');
  const subject = `=?UTF-8?B?${toBase64(email.subject)}?=`;
  const parts = [
    `From: "${senderName}" <${senderEmail}>`,
    `To: ${safeHeader(email.recipient)}`,
    `Subject: ${subject}`,
    `Date: ${new Date(email.sentAt ?? email.scheduledAt).toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    email.body
  ];

  for (const attachment of email.campaign?.attachments ?? []) {
    const filename = attachment.filename.replace(/[\r\n"\\]/g, '_');
    const wrappedContent = attachment.contentBase64.match(/.{1,76}/g)?.join('\r\n') ?? '';
    parts.push(`--${boundary}`, `Content-Type: ${safeHeader(attachment.contentType)}; name="${filename}"`, `Content-Disposition: attachment; filename="${filename}"`, 'Content-Transfer-Encoding: base64', '', wrappedContent);
  }
  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

export default function EmailDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [email, setEmail] = useState<EmailDetails | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEmail(null);
    setError('');
    api.getEmail(id).then(setEmail).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this email.'));
  }, [id]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [moreOpen]);

  async function toggleStar() {
    if (!email || busy) return;
    setBusy(true);
    setError('');
    try { setEmail(await api.setStarred(email.id, !email.isStarred)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the star.'); }
    finally { setBusy(false); }
  }

  function downloadEmail() {
    if (!email) return;
    const blob = new Blob([createEml(email)], { type: 'message/rfc822;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${email.subject.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'email'}.eml`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Email downloaded as .eml.');
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setError('Clipboard access is unavailable in this browser.');
    }
    setMoreOpen(false);
  }

  async function deleteEmail() {
    if (!email || busy) return;
    if (!window.confirm('Permanently delete this email from your account?')) return;
    setBusy(true);
    setError('');
    try { await api.deleteEmail(email.id); onBack(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete this email.'); }
    finally { setBusy(false); }
  }

  if (error && !email) return <div role="alert" className="flex flex-1 items-center justify-center text-red-500">{error}</div>;
  if (!email) return <div className="flex flex-1 items-center justify-center text-slate-400">Loading email…</div>;
  const attachments = email.campaign?.attachments ?? [];
  const scheduledLabel = email.status === 'SCHEDULED' ? `Scheduled at ${new Date(email.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : undefined;
  const rateLimited = email.status === 'SCHEDULED' && /hourly rate limit/i.test(email.error ?? '');

  return <div className="flex min-w-0 flex-1 flex-col">
    <div className="flex h-[72px] items-center justify-between border-b border-slate-100 px-6">
      <button type="button" onClick={onBack} className="flex min-w-0 items-center gap-2 text-left text-lg"><ArrowLeft size={20}/><span className="truncate">{email.subject}</span></button>
      <div className="flex shrink-0 items-center gap-2 text-slate-400">
        <button type="button" aria-label={email.isStarred ? 'Remove star' : 'Star email'} aria-pressed={Boolean(email.isStarred)} title={email.isStarred ? 'Remove star' : 'Star email'} disabled={busy} onClick={() => { void toggleStar(); }} className="rounded-lg p-2 hover:bg-slate-50 hover:text-amber-500"><Star size={18} fill={email.isStarred ? 'currentColor' : 'none'} className={email.isStarred ? 'text-amber-500' : ''}/></button>
        <button type="button" aria-label="Download email" title="Download email" onClick={downloadEmail} className="rounded-lg p-2 hover:bg-slate-50 hover:text-slate-700"><Download size={18}/></button>
        <button type="button" aria-label="Delete email" title="Delete email" disabled={busy} onClick={() => { void deleteEmail(); }} className="rounded-lg p-2 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 size={18}/></button>
        <div className="relative" ref={moreRef}>
          <button type="button" aria-label="More email actions" aria-expanded={moreOpen} aria-haspopup="menu" title="More actions" onClick={() => setMoreOpen((open) => !open)} className="rounded-lg p-2 hover:bg-slate-50 hover:text-slate-700"><MoreHorizontal size={18}/></button>
          {moreOpen && <div role="menu" aria-label="More email actions" className="absolute right-0 top-full z-20 mt-2 min-w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            <button type="button" role="menuitem" onClick={() => { void copyText(email.recipient, 'Recipient'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"><Clipboard size={15}/> Copy recipient</button>
            <button type="button" role="menuitem" onClick={() => { void copyText(email.subject, 'Subject'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"><Clipboard size={15}/> Copy subject</button>
          </div>}
        </div>
      </div>
    </div>
    <div className="p-6 sm:p-10">
      <div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{email.sender?.displayName?.[0] ?? email.sender?.email?.[0]?.toUpperCase() ?? '?'}</div><div className="min-w-0"><div className="truncate font-semibold">{email.sender?.displayName ?? 'Sender'} <span className="font-normal text-slate-400">&lt;{email.sender?.email}&gt;</span></div><div className="text-xs text-slate-400">to {email.recipient} · {formatDateTime(email.sentAt ?? email.scheduledAt)}</div></div><div className="ml-auto"><StatusPill status={email.status} label={scheduledLabel}/></div></div>
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {email.status === 'SENT' && <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{email.previewUrl ? 'Test mode: Ethereal captured this email for preview; it was not delivered to the recipient’s inbox.' : 'The SMTP provider accepted this email for delivery. Check the recipient’s inbox and spam folder; provider acceptance does not guarantee final inbox delivery.'}</p>}
      {rateLimited && <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Hourly rate limit reached; this email was automatically rescheduled. Next send attempt: <strong>{formatDateTime(email.scheduledAt)}</strong>.</p>}
      {email.error && !rateLimited && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{email.error}</p>}
      <div className="mt-10 max-w-[780px] text-sm leading-7 text-slate-700" dangerouslySetInnerHTML={{ __html: email.body }}/>
      {attachments.length > 0 && <div className="mt-8 border-t border-slate-100 pt-4"><h3 className="text-xs font-semibold text-slate-500">Attachments ({attachments.length})</h3><ul className="mt-2 space-y-2">{attachments.map((attachment, index) => <li key={`${attachment.filename}-${index}`} className="flex items-center gap-2 text-sm text-slate-600"><Paperclip size={14} className="text-slate-400"/>{attachment.filename}<span className="text-xs text-slate-400">{Math.max(1, Math.round(attachment.contentBase64.length * 0.75 / 1024))} KB</span></li>)}</ul></div>}
      {email.previewUrl && <a target="_blank" rel="noreferrer" href={email.previewUrl} className="mt-8 inline-block rounded-lg border border-brand px-4 py-2 text-sm text-brand">Open Ethereal preview</a>}
    </div>
  </div>;
}
