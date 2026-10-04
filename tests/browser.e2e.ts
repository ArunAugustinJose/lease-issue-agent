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
  await app.listen(4000, '127.0.0.1');
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
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.error('Browser console:', message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      console.error('HTTP error:', response.status(), response.url());
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
  await page
    .getByLabel('Lease document')
    .setInputFiles('test-data/leases/sample-lease.txt');
  await page.getByRole('button', { name: 'Extract & review lease' }).click();
  await page.getByRole('heading', { name: 'Extracted details' }).waitFor();
  await page
    .locator('.field-card')
    .first()
    .getByText(/Source/)
    .click();
  assert(
    await page
      .locator('.field-card')
      .first()
      .getByText('sample-lease.txt', { exact: true })
      .isVisible(),
  );
  await page.screenshot({
    path: 'test-results/lease-review-desktop.png',
    fullPage: true,
  });
  // Serial owner decisions exercise the UI refresh and final occupancy transition.
  for (let i = 0; i < 16; i++) {
    const card = page.locator('.field-card').nth(i);
    await card.getByRole('button', { name: 'Accept', exact: true }).click();
    await card.locator('.badge').filter({ hasText: 'accepted' }).waitFor();
  }
  await page
    .locator('.notice')
    .getByText(/Owner confirmed/)
    .waitFor();
  assert(
    await page
      .locator('.unit-header')
      .getByText('occupied', { exact: true })
      .isVisible(),
  );
  await page.getByRole('button', { name: /Condition & issues/ }).click();
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
  await page.getByRole('button', { name: 'Accept draft' }).click();
  await page
    .locator('.work-order .badge')
    .filter({ hasText: 'accepted' })
    .waitFor();
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
  await page.getByRole('button', { name: /Condition & issues/ }).click();
  await page
    .locator('.work-order .badge')
    .filter({ hasText: 'accepted' })
    .waitFor();
  assert.deepEqual(errors, [], 'Browser runtime errors');
  console.log(
    'Browser E2E passed: upload, source, 16 owner reviews, occupancy, two photos, draft acceptance, persistence, desktop and mobile.',
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
