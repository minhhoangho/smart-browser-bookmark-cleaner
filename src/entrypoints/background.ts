import { scheduleSync, syncBookmarkIndex } from '@/services/sync';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void syncBookmarkIndex());
  browser.runtime.onStartup.addListener(() => void syncBookmarkIndex());

  const changeEvents = [
    browser.bookmarks.onCreated,
    browser.bookmarks.onRemoved,
    browser.bookmarks.onChanged,
    browser.bookmarks.onMoved,
  ];
  for (const event of changeEvents) {
    event.addListener(() => scheduleSync());
  }
});
