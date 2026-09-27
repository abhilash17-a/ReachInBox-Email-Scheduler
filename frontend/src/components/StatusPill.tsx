export function StatusPill({ status, label }: { status: string; label?: string }) {
  const styles: Record<string,string> = { SENT: 'bg-slate-100 text-slate-600', SCHEDULED: 'bg-emerald-50 text-emerald-700', PROCESSING: 'bg-amber-50 text-amber-700', FAILED: 'bg-red-50 text-red-600', CANCELLED: 'bg-gray-100 text-gray-500' };
  return <span className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>{label ?? status.toLowerCase()}</span>;
}
