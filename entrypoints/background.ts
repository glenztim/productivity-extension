import { recomputeCurrentActivity, handleAlarm, restoreModeAlarms } from '@/lib/accounting';
import { registerNavigationBlocking } from '@/lib/blocking';
import { registerMessageHandlers } from '@/lib/messages';
import { registerTabLimits } from '@/lib/tabLimits';

export default defineBackground(() => {
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
  restoreModeAlarms()
    .catch((err) => console.error('Failed to restore mode alarms', err))
    .finally(() => recomputeCurrentActivity());
});
