import { ChangeEvent, useRef, useState } from 'react';
import { ArrowLeft, Clock3, Paperclip, Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { Sender } from '../types';

type AttachmentDraft = { filename: string; contentType: string; contentBase64: string; size: number };
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return reject(new Error(`Could not read ${file.name}.`));
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}

export default function Compose({ senders, onDone, onBack }: { senders: Sender[]; onDone: () => void; onBack: () => void }) {
  const [senderId, setSenderId] = useState(senders[0]?.id ?? '');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientText, setRecipientText] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [startAt, setStartAt] = useState(() => { const date = new Date(Date.now() + 5 * 60_000); date.setSeconds(0, 0); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); });
  const [delay, setDelay] = useState(2);
  const [hourly, setHourly] = useState(200);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [fileCount, setFileCount] = useState(0);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [readingFiles, setReadingFiles] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const attachmentRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  function addText() {
    const found = recipientText.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean);
    setRecipients((current) => [...new Set([...current, ...found])]);
    setRecipientText('');
  }

  async function parseRecipientFile(file?: File) {
    if (!file) return;
    try {
      const result = await api.parseLeads(file);
      setRecipients((current) => [...new Set([...current, ...result.emails])]);
      setFileCount(result.count);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not parse recipient list.');
    }
  }

  async function addAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const currentBytes = attachments.reduce((sum, attachment) => sum + attachment.size, 0);
    const addedBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (attachments.length + files.length > 5) { setError('Attach up to 5 files.'); return; }
    if (currentBytes + addedBytes > MAX_ATTACHMENT_BYTES) { setError('Attachments must total 5 MB or less.'); return; }
    setReadingFiles(true);
    try {
      const drafts = await Promise.all(files.map(async (file) => ({ filename: file.name, contentType: file.type || 'application/octet-stream', contentBase64: await fileAsBase64(file), size: file.size })));
      setAttachments((current) => [...current, ...drafts]);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read attachment.');
    } finally {
      setReadingFiles(false);
    }
  }

  async function submit() {
    const allRecipients = [...new Set([...recipients, ...recipientText.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean)])];
    if (!senderId) { setError('Select a sender account.'); return; }
    if (!allRecipients.length || !subject.trim() || !body.trim()) { setError('Recipient, subject and body are required.'); return; }
    const scheduledDate = new Date(startAt);
    if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now() - 30_000) { setError('Choose a future send time.'); return; }
    setSending(true);
    setError('');
    try {
      await api.schedule({ senderId, recipients: allRecipients, subject, body, startAt: scheduledDate.toISOString(), delayMs: delay * 1000, hourlyLimit: hourly, attachments: attachments.map(({ size: _size, ...attachment }) => attachment) });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not schedule this email.');
    } finally {
      setSending(false);
    }
  }

  function formatBody(command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList') {
    editorRef.current?.focus();
    document.execCommand(command);
    if (editorRef.current) setBody(editorRef.current.innerHTML);
  }

  function openSchedulePicker() {
    const input = dateRef.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return; } catch { /* Fall back to the browser's native input interaction. */ }
    }
    input.click();
  }

  const recipientCount = new Set([...recipients, ...recipientText.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean)]).size;

  return <div className="flex min-w-0 flex-1 flex-col bg-white">
    <div className="flex h-[72px] items-center justify-between border-b border-slate-100 px-6">
      <div className="flex items-center gap-3"><button type="button" aria-label="Back" onClick={onBack}><ArrowLeft size={19}/></button><h2 className="text-xl font-medium">Compose New Email</h2></div>
      <div className="flex items-center gap-3 text-slate-400">
        <button type="button" aria-label="Attach files" title="Attach files" onClick={() => attachmentRef.current?.click()} className="rounded-lg p-2 hover:bg-slate-50 hover:text-slate-700"><Paperclip size={18}/></button>
        <input ref={attachmentRef} type="file" multiple hidden onChange={addAttachments}/>
        <button type="button" aria-label="Choose schedule time" title="Choose schedule time" onClick={openSchedulePicker} className="rounded-lg p-2 hover:bg-slate-50 hover:text-slate-700"><Clock3 size={18}/></button>
        <button type="button" onClick={() => { void submit(); }} disabled={sending || readingFiles} className="rounded-full border border-brand px-5 py-2 text-sm font-medium text-brand hover:bg-emerald-50 disabled:opacity-60">{sending ? 'Scheduling…' : 'Send Later'}</button>
      </div>
    </div>
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-start gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:p-8">
      <section className="min-w-0">
      {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      <div className="grid grid-cols-[75px_1fr] items-center border-b border-slate-100 py-3 text-sm"><span>From</span><select value={senderId} onChange={(event) => setSenderId(event.target.value)} className="rounded-lg bg-slate-50 px-3 py-2 text-xs outline-none">{senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.displayName ? `${sender.displayName} — ` : ''}{sender.email}</option>)}</select></div>
      <div className="grid grid-cols-[75px_1fr] items-center border-b border-slate-100 py-3 text-sm"><span>To</span><div className="flex min-h-9 flex-wrap items-center gap-1"><input value={recipientText} onChange={(event) => setRecipientText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addText(); } }} onBlur={addText} className="min-w-[180px] flex-1 outline-none" placeholder="recipient@example.com"/>{recipients.slice(0, 8).map((email) => <span key={email} className="rounded-full border border-brand px-2 py-1 text-[11px] text-brand">{email}<button type="button" aria-label={`Remove ${email}`} onClick={() => setRecipients((current) => current.filter((item) => item !== email))}><X size={11} className="ml-1 inline"/></button></span>)}{recipients.length > 8 && <span className="rounded-full border px-2 py-1 text-[11px]">+{recipients.length - 8}</span>}<button type="button" onClick={() => csvRef.current?.click()} className="ml-auto flex items-center gap-1 text-xs text-brand"><Upload size={13}/> Upload List</button><input ref={csvRef} type="file" accept=".csv,.txt" hidden onChange={(event) => { void parseRecipientFile(event.target.files?.[0]); event.target.value = ''; }}/></div></div>
      {fileCount > 0 && <div className="py-2 text-xs text-slate-400">Detected {fileCount} email addresses from uploaded list.</div>}
      {attachments.length > 0 && <div className="flex flex-wrap gap-2 border-b border-slate-100 py-3">{attachments.map((attachment, index) => <span key={`${attachment.filename}-${index}`} className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><Paperclip size={13}/>{attachment.filename}<span className="text-slate-400">{Math.max(1, Math.round(attachment.size / 1024))} KB</span><button type="button" aria-label={`Remove ${attachment.filename}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={13}/></button></span>)}</div>}
      {readingFiles && <div className="py-2 text-xs text-slate-400">Reading attachments…</div>}
      <div className="grid grid-cols-[75px_1fr] border-b border-slate-100 py-3 text-sm"><label htmlFor="email-subject">Subject</label><input id="email-subject" value={subject} onChange={(event) => setSubject(event.target.value)} className="outline-none" placeholder="Subject"/></div>
      <div className="flex flex-wrap gap-6 py-3 text-sm"><label>Delay between emails <input type="number" min="2" value={delay} onChange={(event) => setDelay(Math.max(2, Number(event.target.value)))} className="ml-2 w-16 rounded-md border border-slate-200 px-2 py-1"/> sec</label><label>Hourly Limit <input type="number" min="1" value={hourly} onChange={(event) => setHourly(Math.max(1, Number(event.target.value)))} className="ml-2 w-20 rounded-md border border-slate-200 px-2 py-1"/></label></div>
      <div className="overflow-hidden rounded-xl bg-slate-50"><div className="flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 text-slate-400"><button type="button" aria-label="Bold" onClick={() => formatBody('bold')}><b>B</b></button><button type="button" aria-label="Italic" onClick={() => formatBody('italic')}><i>I</i></button><button type="button" aria-label="Underline" onClick={() => formatBody('underline')}><u>U</u></button><button type="button" onClick={() => formatBody('insertUnorderedList')}>• List</button></div><div ref={editorRef} contentEditable suppressContentEditableWarning onInput={(event) => setBody(event.currentTarget.innerHTML)} className="min-h-[300px] p-5 outline-none" data-placeholder="Type Your Reply…" /></div>
      </section>
      <aside className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm lg:sticky lg:top-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Clock3 size={16} className="text-brand"/> Send Later</div>
        <p className="mt-2 text-xs leading-5 text-slate-400">Choose when this campaign should begin sending.</p>
        <label htmlFor="schedule-at" className="mt-4 block text-xs font-medium text-slate-500">Date and time</label>
        <input ref={dateRef} id="schedule-at" aria-label="Schedule date and time" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="mt-2 w-full min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-xs"/>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500"><div className="font-medium text-slate-700">{recipientCount} recipient{recipientCount === 1 ? '' : 's'}</div><div className="mt-1">{delay}s minimum between sends</div><div className="mt-1">{hourly} emails per hour</div></div>
      </aside>
    </div>
  </div>;
}
