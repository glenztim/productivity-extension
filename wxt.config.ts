import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  browser: 'firefox',
  zip: {
    name: 'focus-pool',
    // Design sources are not needed to build the extension, so they stay out of the AMO source upload.
    excludeSources: ['design/**'],
  },
  manifest: {
    name: 'Focus Pool',
    description: 'Earn time on distracting sites by spending it on productive ones. Hard blocks and tab limits. All data stays on your device.',
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
    },
  },
});
