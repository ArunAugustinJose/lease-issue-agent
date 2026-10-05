import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { strict as assert } from 'node:assert';
import { chromium, type Browser } from 'playwright';
import { createApp } from '../apps/api/src/app';
import type { INestApplication } from '@nestjs/common';
const originalUrl = process.env.DATABASE_URL!;
const schema = `assessment_browser_${process.pid}`;
const admin = new PrismaClient({ datasourceUrl: originalUrl });
let app: INestApplication | undefined;
let web: ChildProcess | undefined;
let browser: Browser | undefined;
let uploads: string | undefined;
async function run() {
  if (!/^assessment_browser_\d+$/.test(schema))
    throw new Error('Unsafe test schema');
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(originalUrl);
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  process.env.MODEL_PROVIDER = 'stub';
  process.env.WEB_ORIGIN = 'http://localhost:3001';
  process.env.PROJECT_ROOT = process.cwd();
  uploads = await mkdtemp(resolve(tmpdir(), 'marina-browser-'));
  process.env.UPLOAD_DIR = uploads;
  execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { env: process.env, stdio: 'pipe' },
  );
  execFileSync(
    process.execPath,
    [resolve('node_modules/tsx/dist/cli.mjs'), 'prisma/seed.ts'],
    { env: process.env, stdio: 'pipe' },
  );
  app = await createApp();
  await app.listen(4001, '127.0.0.1');
  // Test the production build served through the same URLs as local setup.
  web = spawn(
    process.execPath,
    [resolve('node_modules/next/dist/bin/next'), 'start', '-p', '3001'],
    { cwd: resolve('apps/web'), stdio: 'pipe', env: process.env },
  );
  let webLog = '';
  web.stderr?.on('data', (chunk) => {
    webLog += String(chunk);
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (web.exitCode !== null) throw new Error('Next server exited: ' + webLog);
    try {
      ready = (await fetch('http://localhost:3001')).ok;
    } catch {
      /* Wait for startup. */
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, 'Next server did not start');
  const installed = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : installed
        ? { executablePath: installed }
        : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  // Keep any developer API on 4000 untouched; use our isolated test database.
  await page.route('http://localhost:4000/**', async (route) => {
    await route.continue({
      url: route.request().url().replace('localhost:4000', '127.0.0.1:4001'),
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.error('Browser console:', message.text());
  });
  page.on('response', async (response) => {
    if (response.status() >= 400)
      console.error(
        'HTTP error:',
        response.status(),
        response.url(),
        await response.text(),
      );
  });
  page.on('requestfailed', (request) =>
    console.error('Request failed:', request.url(), request.failure()),
  );
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3001');
  try {
    await page
      .getByRole('heading', { name: 'Your property, connected.' })
      .waitFor();
  } catch (error) {
    console.error(await page.locator('body').innerText());
    await mkdir('test-results', { recursive: true });
    await page.screenshot({
      path: 'test-results/browser-failure.png',
      fullPage: true,
    });
    throw error;
  }
  assert.equal(await page.locator('.unit-card').count(), 5);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({
    path: 'test-results/overview-desktop.png',
    fullPage: true,
  });
  await page.getByRole('link').filter({ hasText: 'Apartment 1204' }).click();
  await page.getByRole('heading', { name: 'No lease record yet' }).waitFor();
  assert.equal(
    await page.locator('.unit-summary button, .unit-summary img').count(),
    0,
  );
  assert(await page.getByLabel('Lease document', { exact: true }).isVisible());
  await page
    .getByLabel('Lease document', { exact: true })
    .setInputFiles('test-data/leases/sample-lease.txt');
  await page.getByRole('button', { name: 'Upload lease', exact: true }).click();
  await page.getByRole('heading', { name: 'Extracted details' }).waitFor();
  const rentRow = page
    .locator('.lease-field-row')
    .filter({ hasText: 'Monthly rent (QAR)' });
  await rentRow.getByRole('button', { name: 'View source' }).click();
  await page
    .locator('.lease-source-details:visible')
    .getByText('sample-lease.txt', { exact: true })
    .first()
    .waitFor();
  assert(
    await page
      .locator('.lease-source-details:visible')
      .getByText('sample-lease.txt', { exact: true })
      .first()
      .isVisible(),
  );
  await page.getByRole('button', { name: 'View details for R1' }).click();
  await page
    .getByRole('heading', { name: 'Values used', exact: true })
    .waitFor();
  assert(
    await page
      .getByRole('heading', { name: 'Values used', exact: true })
      .isVisible(),
  );
  for (const width of [1440, 1280, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (
      (await rentRow
        .getByRole('button', { name: 'View source' })
        .getAttribute('aria-expanded')) === 'false'
    )
      await rentRow.getByRole('button', { name: 'View source' }).click();
    await page.screenshot({
      path: `test-results/lease-review-${width}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      `Lease workspace overflows at ${width}px`,
    );
    assert(
      await page.getByLabel('Lease document', { exact: true }).isVisible(),
    );
    assert(
      await page
        .getByRole('button', { name: 'Upload lease', exact: true })
        .isVisible(),
    );
    assert.equal(
      await page.locator('.field-table').first().locator('thead th').count(),
      6,
    );
    if (width >= 1280) {
      const upload = await page.locator('#unit-lease-upload').boundingBox();
      assert(
        upload && upload.height < 150,
        'Desktop upload should remain compact',
      );
    }
    await rentRow.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Current value — Monthly rent (QAR)').waitFor();
    assert(
      await page.getByLabel('Current value — Monthly rent (QAR)').isVisible(),
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const name of ['Parties', 'Lease period', 'Clauses', 'Signatures']) {
    await page.getByRole('button', { name: new RegExp(`^${name} `) }).click();
  }
  const tenantRow = page.locator('.lease-field-row').filter({
    has: page.getByRole('rowheader', { name: 'Tenant', exact: true }),
  });
  await tenantRow.getByRole('button', { name: 'Reject', exact: true }).click();
  await tenantRow.locator('.lease-status.rejected').waitFor();
  assert(
    await tenantRow
      .getByRole('button', { name: 'Reject', exact: true })
      .isDisabled(),
  );
  const originalTenant = await tenantRow.locator('td').first().innerText();
  await tenantRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByLabel('Current value — Tenant', { exact: true })
    .fill('Owner verified tenant');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await tenantRow.getByText('Owner verified tenant').waitFor();
  assert.equal(
    await tenantRow.locator('td').first().innerText(),
    originalTenant,
  );
  assert(
    await tenantRow
      .getByRole('button', { name: 'Accept', exact: true })
      .isDisabled(),
  );
  await page.screenshot({
    path: 'test-results/lease-review-desktop.png',
    fullPage: true,
  });
  // Serial owner decisions exercise the UI refresh and final occupancy transition.
  for (let i = 0; i < 16; i++) {
    const card = page.locator('.lease-field-row').nth(i);
    const accept = card.getByRole('button', { name: 'Accept', exact: true });
    if (!(await accept.isDisabled())) await accept.click();
    await card.locator('.lease-status.accepted').waitFor();
  }
  await page
    .locator('.lease-review-notice')
    .getByText(/Owner confirmed/)
    .waitFor();
  assert(
    await page
      .locator('.unit-header')
      .getByText('occupied', { exact: true })
      .isVisible(),
  );
  await page.getByRole('tab', { name: /Condition & issues/ }).click();
  assert(
    await page.getByLabel('Condition photos', { exact: true }).isVisible(),
  );
  await page
    .getByRole('heading', { name: 'No condition reports yet' })
    .waitFor();
  await page
    .getByLabel('Condition photos')
    .setInputFiles([
      'test-data/photos/mc-b-1204-ac-leak.svg',
      'test-data/photos/mc-b-1204-wall-damage.svg',
    ]);
  await page.getByRole('button', { name: 'Create condition report' }).click();
  await page
    .getByRole('heading', { name: 'Inspect reported AC and wall damage' })
    .waitFor();
  assert.equal(await page.locator('.photo-grid img').count(), 2);
  assert.equal(
    await page.getByLabel('Condition photos', { exact: true }).inputValue(),
    '',
  );
  await page.getByRole('button', { name: 'Accept draft' }).click();
  await page
    .locator('.work-order .badge')
    .filter({ hasText: 'accepted' })
    .waitFor();
  await page.getByRole('button', { name: 'Reject draft', exact: true }).click();
  await page.locator('.work-order .badge.rejected').waitFor();
  await page.getByRole('button', { name: 'Accept draft', exact: true }).click();
  await page.locator('.work-order .badge.accepted').waitFor();
  await page
    .getByLabel('Condition photos', { exact: true })
    .setInputFiles('test-data/photos/mc-b-1204-ac-leak.svg');
  await page
    .getByAltText('Upload preview: mc-b-1204-ac-leak.svg', { exact: true })
    .waitFor();
  assert.equal(await page.locator('.preview-grid img').count(), 1);
  await page.getByRole('button', { name: 'Create condition report' }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.condition-report-card').length === 2,
  );
  await page
    .getByRole('tab', { name: 'Condition & issues 2', exact: true })
    .waitFor();
  const singleReport = page
    .locator('.condition-report-card')
    .filter({ has: page.locator('.single-photo') });
  await singleReport
    .getByRole('button', { name: 'Accept draft', exact: true })
    .click();
  await singleReport.locator('.work-order .badge.accepted').waitFor();
  assert.equal(await page.locator('.photo-grid img').count(), 3);
  for (const width of [1440, 1280, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `test-results/condition-${width}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      `Condition workspace overflows at ${width}px`,
    );
    assert(
      await page.getByLabel('Condition photos', { exact: true }).isVisible(),
    );
    assert(
      await page
        .getByRole('button', { name: 'View lease records', exact: true })
        .isVisible(),
    );
    if (width < 1100) {
      const upload = await page
        .locator('.condition-upload-panel')
        .boundingBox();
      const reports = await page
        .locator('.condition-report-list')
        .boundingBox();
      const context = await page
        .locator('.condition-context-card')
        .boundingBox();
      assert(
        upload &&
          reports &&
          context &&
          upload.y < reports.y &&
          reports.y < context.y,
        'Mobile order should be upload, reports, context',
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: 'test-results/issues-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/unit-mobile.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    'Mobile page overflows horizontally',
  );
  await page.reload();
  await page.getByRole('tab', { name: /Condition & issues/ }).click();
  await page
    .locator('.work-order .badge')
    .first()
    .filter({ hasText: 'accepted' })
    .waitFor();
  await page
    .getByRole('button', { name: 'View lease records', exact: true })
    .click();
  await page
    .getByRole('tab', { name: /Lease records/, selected: true })
    .waitFor();
  await page
    .getByLabel('Lease document', { exact: true })
    .setInputFiles('test-data/leases/problematic-lease.txt');
  await page.getByRole('button', { name: 'Upload lease', exact: true }).click();
  await page
    .locator('.lease-record-summary')
    .getByText('problematic-lease.txt', { exact: true })
    .first()
    .waitFor();
  assert(
    await page
      .getByText(/This document does not identify this unit/)
      .isVisible(),
  );
  const warningRecord = page.locator('.unit-lease-record').first();
  const warningMessage = await warningRecord
    .locator('.lease-warning')
    .first()
    .locator('.lease-warning-message strong')
    .innerText();
  const warning = warningRecord
    .locator('.lease-warning')
    .filter({ has: page.getByText(warningMessage, { exact: true }) });
  await warning.getByRole('button', { name: /View warning source/ }).click();
  await warning.getByRole('heading', { name: /Source/ }).waitFor();
  assert(await warning.getByRole('heading', { name: /Source/ }).isVisible());
  await warning
    .getByRole('button', { name: 'Accept warning', exact: true })
    .click();
  await warning.locator('.lease-status.accepted').waitFor();
  assert(
    await warning
      .getByRole('button', { name: 'Accept warning', exact: true })
      .isDisabled(),
  );
  await warning
    .getByRole('button', { name: 'Reject warning', exact: true })
    .click();
  await warning.locator('.lease-status.rejected').waitFor();
  assert(
    await warning
      .getByRole('button', { name: 'Reject warning', exact: true })
      .isDisabled(),
  );
  for (const width of [1440, 1280, 1024, 768, 430, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await warningRecord.screenshot({
      path: `test-results/lease-warnings-${width}.png`,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      `Warning workspace overflows at ${width}px`,
    );
    assert(
      await warning
        .getByRole('button', { name: 'Accept warning', exact: true })
        .isVisible(),
    );
    assert(
      await warning
        .getByRole('button', { name: 'Reject warning', exact: true })
        .isVisible(),
    );
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(
    'Browser E2E passed: inline lease upload, sources, owner reviews, occupancy, single/multiple photos, draft accept/reject, context, persistence and six viewport sizes.',
  );
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    if (web?.pid) {
      web.kill();
      await new Promise<void>((r) => {
        if (web?.exitCode !== null) r();
        else web?.once('exit', () => r());
      });
    }
    await app?.close();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
    if (uploads) await rm(uploads, { recursive: true, force: true });
  });
