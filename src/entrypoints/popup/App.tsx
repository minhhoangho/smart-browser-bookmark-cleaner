import { browser } from '#imports';

export default function App() {
  const open = () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
    window.close();
  };

  return (
    <main className="w-72 p-4">
      <h1 className="text-base font-semibold text-slate-900">Smart Bookmark Cleaner</h1>
      <p className="mt-1 text-sm text-slate-500">
        Find duplicates, empty folders, and entries the scanner cannot check.
      </p>
      <button
        type="button"
        onClick={open}
        className="mt-4 w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Open audit
      </button>
    </main>
  );
}
