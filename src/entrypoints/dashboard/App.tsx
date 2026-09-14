import { useEffect, useRef, useState } from 'react';
import type { AuditReport } from '@/core/bookmarks/audit';
import { openBookmarkManager } from '@/adapters/bookmark-manager';
import { runAudit } from '@/services/audit';
import SummaryCards from '@/ui/components/SummaryCards';
import DuplicateList from '@/ui/components/DuplicateList';
import PathList from '@/ui/components/PathList';

type State =
  | { status: 'loading' }
  | { status: 'ready'; report: AuditReport }
  | { status: 'error'; message: string };

function openFolder(folderId: string): void {
  void openBookmarkManager(folderId).catch((error: unknown) => {
    console.error('[sbc] could not open the bookmark manager', error);
  });
}

export default function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const hasReport = useRef(false);

  useEffect(() => {
    let active = true;
    let latestRequest = 0;

    const load = () => {
      const request = ++latestRequest;
      runAudit().then(
        (report) => {
          if (!active || request !== latestRequest) return;
          hasReport.current = true;
          setState({ status: 'ready', report });
        },
        (error: unknown) => {
          if (!active || request !== latestRequest) return;
          // A failed refresh keeps the report already on screen instead of
          // replacing it with an error; only a first load has nothing to keep.
          if (hasReport.current) {
            console.error('[sbc] audit refresh failed', error);
            return;
          }
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        },
      );
    };

    // Chrome's bookmark manager opens in another tab, so returning here is the
    // moment a deletion made there should show up.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') load();
    };

    load();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-slate-50 p-8 text-slate-900">
      <h1 className="text-xl font-semibold">Bookmark audit</h1>
      <p className="mt-1 text-sm text-slate-500">
        This page never changes your bookmarks. To remove something, use Show in Chrome and delete it
        in Chrome's bookmark manager, which can undo a deletion while its tab stays open. Counts
        refresh when you come back here.
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
            <DuplicateList groups={state.report.duplicateGroups} onOpenFolder={openFolder} />
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold">Empty folders</h2>
            <PathList
              items={state.report.emptyFolders.map((f) => ({
                id: f.id, title: f.title, path: f.path, folderId: f.parentId,
              }))}
              emptyMessage="No empty folders."
              onOpenFolder={openFolder}
            />
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold">Not checkable</h2>
            <p className="mb-3 text-sm text-slate-500">
              Bookmarklets, local files, and intranet addresses. The link scanner will skip these.
            </p>
            <PathList
              items={state.report.unscannable.map((b) => ({
                id: b.id, title: b.title, path: b.path, detail: b.url, folderId: b.parentId,
              }))}
              emptyMessage="Nothing skipped."
              onOpenFolder={openFolder}
            />
          </section>
        </div>
      )}
    </main>
  );
}
