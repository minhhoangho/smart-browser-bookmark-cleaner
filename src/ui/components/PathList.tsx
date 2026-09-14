import ShowInChromeButton from './ShowInChromeButton';

export interface PathListItem {
  id: string;
  title: string;
  path: string[];
  detail?: string;
  /** The folder to open in Chrome's bookmark manager so this item is visible there. */
  folderId?: string;
}

interface Props {
  items: PathListItem[];
  emptyMessage: string;
  onOpenFolder?: (folderId: string) => void;
}

export default function PathList({ items, emptyMessage, onOpenFolder }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {items.map((item) => {
        const title = item.title || '(untitled)';
        const pathText = item.path.length > 0 ? item.path.join(' / ') : '(top level)';
        const { folderId } = item;
        return (
          <li key={item.id} className="flex items-baseline gap-2 px-4 py-2 text-sm">
            <span className="truncate text-slate-900">{title}</span>
            <span className="text-slate-400">{pathText}</span>
            {item.detail !== undefined && (
              <span className="ml-auto max-w-[40%] truncate font-mono text-xs text-slate-400">{item.detail}</span>
            )}
            {onOpenFolder && folderId && (
              <ShowInChromeButton
                label={`"${title}" (${pathText})`}
                folderId={folderId}
                onOpenFolder={onOpenFolder}
                className={item.detail === undefined ? 'ml-auto' : ''}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
