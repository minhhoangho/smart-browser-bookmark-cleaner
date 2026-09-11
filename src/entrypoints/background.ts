import { scheduleSync, syncBookmarkIndex } from '@/services/sync';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void syncBookmarkIndex().catch((error: unknown) => {
      console.error('[sbc] install sync failed', error);
    });
  });
  browser.runtime.onStartup.addListener(() => {
    void syncBookmarkIndex().catch((error: unknown) => {
      console.error('[sbc] startup sync failed', error);
    });
  });

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
