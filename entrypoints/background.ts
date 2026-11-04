import { recomputeCurrentActivity, handleAlarm, restoreModeAlarms } from '@/lib/accounting';
import { registerNavigationBlocking } from '@/lib/blocking';
import { registerMessageHandlers } from '@/lib/messageHandler';
import { runMigrations } from '@/lib/migrations';
import { registerTabLimits } from '@/lib/tabLimits';

export default defineBackground(() => {
  // First, so it takes the accounting lock before any listener below can queue work behind it.
  const migrated = runMigrations();

  registerNavigationBlocking();
  registerMessageHandlers();
  registerTabLimits();

  browser.alarms.onAlarm.addListener((alarm) => {
    handleAlarm(alarm.name);
  });

  browser.tabs.onActivated.addListener(() => {
    recomputeCurrentActivity();
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) {
      recomputeCurrentActivity();
    }
  });

  browser.windows.onFocusChanged.addListener(() => {
    recomputeCurrentActivity();
  });

  browser.runtime.onStartup.addListener(() => {
    recomputeCurrentActivity();
  });

  browser.runtime.onInstalled.addListener(() => {
    recomputeCurrentActivity();
  });

  // Alarms do not survive a Firefox restart: re-create the mode's end alarm before first evaluating activity.
  migrated
    .then(() => restoreModeAlarms())
    .catch((err) => console.error('Failed to restore mode alarms', err))
    .finally(() => recomputeCurrentActivity());
});
