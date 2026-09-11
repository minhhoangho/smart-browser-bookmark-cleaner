export interface PathListItem {
  id: string;
  title: string;
  path: string[];
  detail?: string;
}

interface Props {
  items: PathListItem[];
  emptyMessage: string;
}

export default function PathList({ items, emptyMessage }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {items.map((item) => (
        <li key={item.id} className="flex items-baseline gap-2 px-4 py-2 text-sm">
          <span className="truncate text-slate-900">{item.title || '(untitled)'}</span>
          <span className="text-slate-400">
            {item.path.length > 0 ? item.path.join(' / ') : '(top level)'}
          </span>
          {item.detail !== undefined && (
            <span className="ml-auto truncate font-mono text-xs text-slate-400">{item.detail}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
