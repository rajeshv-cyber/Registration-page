const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 0,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 }
  }
});
