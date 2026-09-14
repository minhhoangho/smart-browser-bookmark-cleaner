interface Props {
  /** Identifies the item for screen readers, e.g. `"Docs" (Bookmarks bar / Dev)`. */
  label: string;
  folderId: string;
  onOpenFolder: (folderId: string) => void;
  className?: string;
}

/** Opens Chrome's bookmark manager at a folder. Changes nothing itself. */
export default function ShowInChromeButton({ label, folderId, onOpenFolder, className = '' }: Props) {
  return (
    <button
      type="button"
      onClick={() => onOpenFolder(folderId)}
      aria-label={`Show ${label} in Chrome`}
      title="Open Chrome's bookmark manager at the folder containing this item"
      className={`shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 ${className}`.trim()}
    >
      Show in Chrome
    </button>
  );
}
