import { useEffect, useState } from 'react';
import type { AuditReport } from '@/core/bookmarks/audit';
import { runAudit } from '@/services/audit';
import SummaryCards from '@/ui/components/SummaryCards';
import DuplicateList from '@/ui/components/DuplicateList';
import PathList from '@/ui/components/PathList';

type State =
  | { status: 'loading' }
  | { status: 'ready'; report: AuditReport }
  | { status: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    runAudit().then(
      (report) => { if (!cancelled) setState({ status: 'ready', report }); },
      (error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-slate-50 p-8 text-slate-900">
      <h1 className="text-xl font-semibold">Bookmark audit</h1>
      <p className="mt-1 text-sm text-slate-500">
        Read-only for now — cleanup actions arrive once Trash and undo are in place.
      </p>

      {state.status === 'loading' && <p className="mt-8 text-sm text-slate-500">Reading your bookmarks…</p>}

      {state.status === 'error' && (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not read your bookmarks: {state.message}
        </p>
      )}

      {state.status === 'ready' && (
        <div className="mt-6 space-y-8">
          <SummaryCards
            totalBookmarks={state.report.totalBookmarks}
            redundantCount={state.report.redundantCount}
            emptyFolderCount={state.report.emptyFolders.length}
            unscannableCount={state.report.unscannable.length}
          />

          <section>
            <h2 className="mb-3 text-base font-semibold">Duplicates</h2>
            <DuplicateList groups={state.report.duplicateGroups} />
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold">Empty folders</h2>
            <PathList
              items={state.report.emptyFolders.map((f) => ({ id: f.id, title: f.title, path: f.path }))}
              emptyMessage="No empty folders."
            />
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold">Not checkable</h2>
            <p className="mb-3 text-sm text-slate-500">
              Bookmarklets, local files, and intranet addresses. The link scanner will skip these.
            </p>
            <PathList
              items={state.report.unscannable.map((b) => ({
                id: b.id, title: b.title, path: b.path, detail: b.url,
              }))}
              emptyMessage="Nothing skipped."
            />
          </section>
        </div>
      )}
    </main>
  );
}
