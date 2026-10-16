'use strict';

/** Shader compilation and WebGL errors often use console.error without an
 * uncaught exception. Both channels invalidate the entire page's evidence.
 */
function watchBrowserErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push({ channel: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ channel: 'console.error', message: message.text(), location: message.location() });
  });
  return {
    errors,
    assertClean(phase) {
      if (errors.length) throw new Error(`Browser errors ${phase}: ${errors.map(error => `${error.channel}: ${error.message}`).join('; ')}`);
    },
  };
}

async function checkedScreenshot(page, filename, assertHealthy) {
  await assertHealthy('before screenshot');
  await page.locator('#stage').screenshot({ path: filename });
  await assertHealthy('after screenshot');
}

module.exports = { watchBrowserErrors, checkedScreenshot };
