import { test } from '@playwright/test';
import fs from 'fs';
import nodemailer from 'nodemailer';

/* ================== GLOBAL SETTINGS ================== */
test.setTimeout(0); //  NO TIMEOUT AT ALL

/* ================== LOAD CONFIG ================== */
const config = JSON.parse(
  fs.readFileSync('./RegistrationConf.json', 'utf-8')
);

/* ================== HELPER FUNCTION ================== */
async function performAction(page, step) {
  const { xpath, action, value, optional } = step;
  if (!action || !xpath) return;

  const xpaths = Array.isArray(xpath) ? xpath : [xpath];

  for (const xp of xpaths) {
    const locator = xp.startsWith('//')
      ? page.locator(`xpath=${xp}`)
      : page.locator(xp);

    try {
      await locator.waitFor({
        state: 'attached',
        timeout: optional ? 3000 : 10000
      });

      if (action !== 'check') {
        await locator.waitFor({
          state: 'visible',
          timeout: optional ? 3000 : 10000
        });
      }

      switch (action) {
        case 'fill':
          await locator.fill(value);
          break;
        case 'click':
          await locator.click();
          break;
        case 'check':
          await locator.check({ force: true });
          break;
        case 'select':
          try {
            await locator.selectOption({ label: value });
          } catch {
            await locator.selectOption({ value });
          }
          break;
        case 'upload':
          await locator.setInputFiles(value);
          break;
      }

      console.log(` ${action.toUpperCase()} → ${xp}`);
      return;

    } catch {
      // try next xpath
    }
  }

  if (optional) {
    console.warn(` Skipped optional step: ${xpaths.join(' | ')}`);
  } else {
    throw new Error(`Element not found: ${xpaths.join(' | ')}`);
  }
}

/* ================== TEST ================== */
test('WRF conference registration (JSON driven)', async ({ browser }) => {

  let passed = 0;
  let failed = 0;
  const passedList = [];
  const failedList = [];

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  for (const site of config) {
    for (const url of site.urls) {

      console.log(`\n Processing URL: ${url}`);
      const page = await context.newPage();

      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 120000
        });

        for (const step of site.elements) {
          await performAction(page, step);
        }

        console.log(`✔ Finished: ${url}`);
        passed++;
        passedList.push(url);

      } catch (err) {
        console.error(`✘ Error on ${url}: ${err.message}`);
        failed++;
        failedList.push(`${url} → ${err.message}`);

      } finally {
        try { await page.close(); } catch {}
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  /* ================== EMAIL REPORT ================== */
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"WWC Registration Automation" <${process.env.GMAIL_USER}>`,
      to: 'rajesh.v@technoarete.org,nileshkumar@technoarete.org',
      subject: 'WWC Automation Registration Page Report',
      text: `
Total Sites : ${passed + failed}
Passed      : ${passed}
Failed      : ${failed}

PASSED:
${passedList.join('\n') || 'None'}

FAILED:
${failedList.join('\n') || 'None'}
`
    });

    console.log('📧 Email sent successfully');

  } catch (emailErr) {
    console.error(` Email failed: ${emailErr.message}`);
  }

  try { await context.close(); } catch {}
});
