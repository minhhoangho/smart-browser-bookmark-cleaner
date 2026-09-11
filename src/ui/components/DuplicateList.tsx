import type { DuplicateGroup } from '@/core/bookmarks/duplicates';

function formatPath(path: string[]): string {
  return path.length > 0 ? path.join(' / ') : '(top level)';
}

export default function DuplicateList({ groups }: { groups: DuplicateGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">No duplicates found.</p>;
  }

  return (
    <ul className="space-y-3">
      {groups.map((group) => (
        <li key={group.normalizedUrl} className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="truncate font-mono text-xs text-slate-500">{group.normalizedUrl}</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex items-baseline gap-2">
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">keep</span>
              <span className="min-w-0 text-slate-900">{group.keeper.title}</span>
              <span className="min-w-0 text-slate-400">{formatPath(group.keeper.path)}</span>
            </li>
            {group.duplicates.map((duplicate) => (
              <li key={duplicate.id} className="flex items-baseline gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">copy</span>
                <span className="min-w-0 text-slate-900">{duplicate.title}</span>
                <span className="min-w-0 text-slate-400">{formatPath(duplicate.path)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
