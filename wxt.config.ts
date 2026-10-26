import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  browser: 'firefox',
  manifest: {
    permissions: ['storage', 'tabs', 'alarms', 'webNavigation'],
    host_permissions: ['<all_urls>'],
    browser_specific_settings: {
      gecko: {
        id: 'productivity-boost@example.com',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
