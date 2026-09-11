interface Props {
  totalBookmarks: number;
  redundantCount: number;
  emptyFolderCount: number;
  unscannableCount: number;
}

const CARD = 'rounded-lg border border-slate-200 bg-white p-4';

export default function SummaryCards({
  totalBookmarks,
  redundantCount,
  emptyFolderCount,
  unscannableCount,
}: Props) {
  const cards: [number, string][] = [
    [totalBookmarks, 'bookmarks'],
    [redundantCount, 'redundant copies'],
    [emptyFolderCount, 'empty folders'],
    [unscannableCount, 'not checkable'],
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(([value, label]) => (
        <div key={label} className={CARD}>
          <div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
          <div className="text-sm text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}
