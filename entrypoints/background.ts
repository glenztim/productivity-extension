import { recomputeCurrentActivity, handleAlarm, restoreModeAlarms } from '@/lib/accounting';
import { registerNavigationBlocking } from '@/lib/blocking';
import { logError } from '@/lib/logError';
import { registerMessageHandlers } from '@/lib/messageHandler';
import { runMigrations } from '@/lib/migrations';
import { registerTabLimits } from '@/lib/tabLimits';

/** Event listeners cannot await their handler, so a rejection would be unhandled. Log it (name only) instead. */
function recompute(): void {
  recomputeCurrentActivity().catch((err) => logError('Failed to re-evaluate the current activity', err));
}

export default defineBackground(() => {
  // First, so it takes the accounting lock before any listener below can queue work behind it.
  const migrated = runMigrations();

  registerNavigationBlocking();
  registerMessageHandlers();
  registerTabLimits();

  browser.alarms.onAlarm.addListener((alarm) => {
    handleAlarm(alarm.name).catch((err) => logError('Failed to handle an alarm', err));
  });

  browser.tabs.onActivated.addListener(() => {
    recompute();
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) {
      recompute();
    }
  });

  browser.windows.onFocusChanged.addListener(() => {
    recompute();
  });

  browser.runtime.onStartup.addListener(() => {
    recompute();
  });

  browser.runtime.onInstalled.addListener(() => {
    recompute();
  });

  // Alarms do not survive a Firefox restart: re-create the mode's end alarm before first evaluating activity.
  migrated
    .then(() => restoreModeAlarms())
    .catch((err) => logError('Failed to restore mode alarms', err))
    .finally(() => recompute());
});
