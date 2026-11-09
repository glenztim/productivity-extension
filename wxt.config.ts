import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  browser: 'firefox',
  zip: {
    name: 'focused-time',
    // Design sources are not needed to build the extension, so they stay out of the AMO source upload.
    excludeSources: ['design/**'],
  },
  manifest: {
    name: 'Focused Time',
    description: 'Earn your breaks, cap your tabs, and track your focus over time.',
    permissions: ['storage', 'tabs', 'alarms', 'webNavigation', 'notifications'],
    browser_specific_settings: {
      gecko: {
        id: 'focus-pool@timglenz',
        // data_collection_permissions needs Firefox 140; storage.session (115) and event pages are covered by that.
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['none'],
        },
      },
      // Firefox for Android only understands data_collection_permissions from 142, so its minimum is higher than desktop's.
      gecko_android: {
        strict_min_version: '142.0',
      },
    },
  },
});
