import { test } from '@playwright/test';
import fs from 'fs';
import nodemailer from 'nodemailer';

test.setTimeout(0); // 🔥 NO TIMEOUT AT ALL

const SLACK_WEBHOOK_URL =
  'https://hooks.slack.com/services/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';

const config = JSON.parse(
  fs.readFileSync('./Sampletest.json', 'utf-8')
);

/* ================== HELPER ================== */
async function performAction(page, step) {
  const { xpath, action, value, optional } = step;
  if (!action || !xpath) return;

  const selectors = Array.isArray(xpath) ? xpath : [xpath];

  for (const sel of selectors) {
    const locator = sel.startsWith('//')
      ? page.locator(`xpath=${sel}`)
      : page.locator(sel);

    try {
      await locator.first().waitFor({
        state: 'attached',
        timeout: optional ? 2000 : 5000
      });

      if (action !== 'check') {
        await locator.first().waitFor({
          state: 'visible',
          timeout: optional ? 2000 : 5000
        });
      }

      switch (action) {
        case 'fill':
          await locator.first().fill(value);
          break;
        case 'click':
          await locator.first().click();
          break;
        case 'check':
          await locator.first().check({ force: true });
          break;
        case 'select':
          try {
            await locator.first().selectOption({ label: value });
          } catch {
            await locator.first().selectOption({ value });
          }
          break;
        case 'upload':
          await locator.first().setInputFiles(value);
          break;
      }

      console.log(`✔ ${action.toUpperCase()} → ${sel}`);
      return;

    } catch {
      // try next selector
    }
  }

  if (optional) {
    console.warn(`⚠️ Skipped optional: ${selectors.join(' | ')}`);
  } else {
    throw new Error(`Element not found: ${selectors.join(' | ')}`);
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

      console.log(`\n▶ Processing URL: ${url}`);
      const page = await context.newPage();

      try {
        // ✅ SAFE PAGE LOAD (NO FAIL)
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 0
        });

        // small breathing delay for heavy JS sites
        await page.waitForTimeout(2000);

        for (const step of site.elements) {
          await performAction(page, step);
        }

        passed++;
        passedList.push(url);
        console.log(` Finished: ${url}`);

      } catch (err) {
        console.error(` Error on ${url}: ${err.message}`);
        failed++;
        failedList.push(`${url} → ${err.message}`);

      } finally {
        try { await page.close(); } catch {}
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  /* ================== REPORT ================== */
  const reportText = `
Total Sites : ${passed + failed}
Passed      : ${passed}
Failed      : ${failed}

PASSED:
${passedList.join('\n') || 'None'}

FAILED:
${failedList.join('\n') || 'None'}
`;

  /* ================== EMAIL ================== */
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
      to: 'rajesh.v@technoarete.org',
      subject: 'WWC Automation Registration Page Report',
      text: reportText
    });

    console.log('📧 Email sent');
  } catch (e) {
    console.error(`📧 Email failed: ${e.message}`);
  }

  /* ================== SLACK ================== */
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*WWC Automation Registration Page Report*\n\`\`\`${reportText}\`\`\``
      })
    });

    console.log('💬 Slack sent');
  } catch (e) {
    console.error(`💬 Slack failed: ${e.message}`);
  }

  try { await context.close(); } catch {}
});

