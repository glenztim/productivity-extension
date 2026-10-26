import { recomputeCurrentActivity, handleAlarm } from '@/lib/accounting';
import { registerNavigationBlocking } from '@/lib/blocking';
import { registerMessageHandlers } from '@/lib/messages';

export default defineBackground(() => {
  registerNavigationBlocking();
  registerMessageHandlers();

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

  recomputeCurrentActivity();
});
