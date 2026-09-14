import type { DuplicateGroup } from '@/core/bookmarks/duplicates';
import type { BookmarkRecord } from '@/shared/types';
import ShowInChromeButton from './ShowInChromeButton';

function formatPath(path: string[]): string {
  return path.length > 0 ? path.join(' / ') : '(top level)';
}

const BADGE = {
  keep: 'rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800',
  copy: 'rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600',
} as const;

interface RowProps {
  kind: keyof typeof BADGE;
  record: BookmarkRecord;
  onOpenFolder?: (folderId: string) => void;
}

function Row({ kind, record, onOpenFolder }: RowProps) {
  const pathText = formatPath(record.path);
  return (
    <li className="flex items-baseline gap-2">
      <span className={BADGE[kind]}>{kind}</span>
      <span className="truncate text-slate-900">{record.title}</span>
      <span className="text-slate-400">{pathText}</span>
      {onOpenFolder && record.parentId && (
        <ShowInChromeButton
          label={`"${record.title || '(untitled)'}" (${pathText})`}
          folderId={record.parentId}
          onOpenFolder={onOpenFolder}
          className="ml-auto"
        />
      )}
    </li>
  );
}

interface Props {
  groups: DuplicateGroup[];
  onOpenFolder?: (folderId: string) => void;
}

export default function DuplicateList({ groups, onOpenFolder }: Props) {
  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">No duplicates found.</p>;
  }

  return (
    <ul className="space-y-3">
      {groups.map((group) => (
        <li key={group.normalizedUrl} className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="truncate font-mono text-xs text-slate-500">{group.normalizedUrl}</p>
          <ul className="mt-2 space-y-1 text-sm">
            <Row kind="keep" record={group.keeper} onOpenFolder={onOpenFolder} />
            {group.duplicates.map((duplicate) => (
              <Row key={duplicate.id} kind="copy" record={duplicate} onOpenFolder={onOpenFolder} />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
