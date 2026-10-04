import 'dotenv/config';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type {
  LeaseView,
  IssueView,
  UnitDetail,
  UnitView,
} from '@marina/contracts';
import { createApp } from '../apps/api/src/app';
const enabled = process.env.RUN_DB_TESTS === '1';
describe.skipIf(!enabled)(
  'PostgreSQL API integration and critical E2E flow',
  () => {
    let app: INestApplication;
    let admin: PrismaClient;
    let uploadDir: string;
    const schema = `assessment_test_${process.pid}`;
    const originalUrl = process.env.DATABASE_URL!;
    const originalUploads = process.env.UPLOAD_DIR;
    let problematic: LeaseView;
    beforeAll(async () => {
      if (!/^assessment_test_\d+$/.test(schema))
        throw new Error('Unsafe test schema');
      admin = new PrismaClient({ datasourceUrl: originalUrl });
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      const url = new URL(originalUrl);
      url.searchParams.set('schema', schema);
      process.env.DATABASE_URL = url.toString();
      process.env.NODE_ENV = 'test';
      process.env.MODEL_PROVIDER = 'stub';
      process.env.PROJECT_ROOT = process.cwd();
      uploadDir = await mkdtemp(resolve(tmpdir(), 'marina-assessment-'));
      process.env.UPLOAD_DIR = uploadDir;
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
      await app.init();
    });
    afterAll(async () => {
      if (app) await app.close();
      if (admin) {
        await admin.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
        );
        await admin.$disconnect();
      }
      if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
      process.env.DATABASE_URL = originalUrl;
      process.env.UPLOAD_DIR = originalUploads;
    });
    it('retrieves the exact seed and preserves initial occupancy', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/units')
        .expect(200);
      const units = response.body as UnitView[];
      expect(units.map((u) => u.id).sort()).toEqual([
        'MC-A-0301',
        'MC-A-0302',
        'MC-B-0902',
        'MC-B-1204',
        'MC-B-1205',
      ]);
      expect(units.find((u) => u.id === 'MC-B-1204')?.status).toBe('AVAILABLE');
      expect(units.find((u) => u.id === 'MC-B-1205')?.status).toBe('OCCUPIED');
    });
    it('runs lease upload → review → occupancy → photos → linked unit context', async () => {
      const uploaded = await request(app.getHttpServer())
        .post('/api/leases')
        .attach('file', 'test-data/leases/sample-lease.txt')
        .expect(201);
      let lease = uploaded.body as LeaseView;
      expect(lease.fields).toHaveLength(16);
      expect(lease.fields.every((f) => f.reviewStatus === 'PENDING')).toBe(
        true,
      );
      expect(lease.validations).toHaveLength(7);
      expect(
        lease.validations.every((r) => r.status === 'PASS' && r.sources.length),
      ).toBe(true);
      expect(lease.linked).toBe(false);
      expect(
        (await request(app.getHttpServer()).get('/api/units/MC-B-1204')).body
          .status,
      ).toBe('AVAILABLE');
      const unitField = lease.fields.find((f) => f.key === 'unit')!;
      await request(app.getHttpServer())
        .patch(`/api/leases/${lease.id}/fields/${unitField.id}`)
        .send({ status: 'ACCEPTED' })
        .expect(200);
      expect(
        (await request(app.getHttpServer()).get('/api/units/MC-B-1204')).body
          .status,
      ).toBe('AVAILABLE');
      for (const field of lease.fields.filter((f) => f.key !== 'unit'))
        lease = (
          await request(app.getHttpServer())
            .patch(`/api/leases/${lease.id}/fields/${field.id}`)
            .send({ status: 'ACCEPTED' })
            .expect(200)
        ).body as LeaseView;
      expect(lease.linked).toBe(true);
      expect(lease.unitId).toBe('MC-B-1204');
      await request(app.getHttpServer())
        .patch(`/api/leases/${lease.id}/fields/${unitField.id}`)
        .send({ status: 'REJECTED' })
        .expect(409);
      const issue = (
        await request(app.getHttpServer())
          .post('/api/issues')
          .field('unitId', 'MC-B-1204')
          .attach('photos', 'test-data/photos/mc-b-1204-ac-leak.svg')
          .attach('photos', 'test-data/photos/mc-b-1204-wall-damage.svg')
          .expect(201)
      ).body as IssueView;
      expect(issue.photos).toHaveLength(2);
      expect(issue.condition).toBe('WORN');
      expect(issue.assets).toHaveLength(2);
      expect(issue.damages).toHaveLength(4);
      expect(issue.workOrder.reviewStatus).toBe('PENDING');
      expect(issue.workOrder.photoIds).toHaveLength(2);
      const file = await request(app.getHttpServer())
        .get(issue.photos[0].url)
        .expect(200);
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      await request(app.getHttpServer())
        .patch(`/api/work-orders/${issue.workOrder.id}`)
        .send({ status: 'REJECTED' })
        .expect(200);
      const accepted = (
        await request(app.getHttpServer())
          .patch(`/api/work-orders/${issue.workOrder.id}`)
          .send({ status: 'ACCEPTED' })
          .expect(200)
      ).body as IssueView;
      expect(accepted.workOrder.reviewStatus).toBe('ACCEPTED');
      const detail = (
        await request(app.getHttpServer())
          .get('/api/units/MC-B-1204')
          .expect(200)
      ).body as UnitDetail;
      expect(detail.status).toBe('OCCUPIED');
      expect(detail.leases[0].id).toBe(lease.id);
      expect(detail.issues[0].id).toBe(issue.id);
      const fresh = (
        await request(app.getHttpServer())
          .get(`/api/leases/${lease.id}`)
          .expect(200)
      ).body as LeaseView;
      expect(fresh.fields.every((f) => f.reviewStatus === 'ACCEPTED')).toBe(
        true,
      );
    });
    it('persists overrides, recalculates rules and keeps occupied units untouched', async () => {
      problematic = (
        await request(app.getHttpServer())
          .post('/api/leases')
          .attach('file', 'test-data/leases/problematic-lease.txt')
          .expect(201)
      ).body as LeaseView;
      expect(
        problematic.validations
          .filter((r) => r.status === 'FAIL')
          .map((r) => r.ruleId),
      ).toEqual(['R1', 'R2', 'R3', 'R5', 'R6', 'R7']);
      const field = problematic.fields.find((f) => f.key === 'deposit')!;
      const reviewed = (
        await request(app.getHttpServer())
          .patch(`/api/leases/${problematic.id}/fields/${field.id}`)
          .send({ status: 'ACCEPTED', value: '9000' })
          .expect(200)
      ).body as LeaseView;
      const changed = reviewed.fields.find((f) => f.id === field.id)!;
      expect(changed.originalValue).toBe('4000');
      expect(changed.currentValue).toBe('9000.00');
      expect(changed.overridden).toBe(true);
      expect(changed.sources.length).toBeGreaterThan(0);
      expect(reviewed.validations.find((r) => r.ruleId === 'R1')?.status).toBe(
        'PASS',
      );
      const flag = reviewed.flags[0];
      const after = (
        await request(app.getHttpServer())
          .patch(`/api/leases/${problematic.id}/flags/${flag.id}`)
          .send({ status: 'REJECTED' })
          .expect(200)
      ).body as LeaseView;
      expect(after.flags.find((f) => f.id === flag.id)?.reviewStatus).toBe(
        'REJECTED',
      );
      expect(
        (await request(app.getHttpServer()).get('/api/units/MC-B-1205')).body
          .status,
      ).toBe('OCCUPIED');
      expect(after.linked).toBe(false);
    });
    it('rejects bad uploads and invalid DTOs without partial persistence', async () => {
      await request(app.getHttpServer())
        .post('/api/leases')
        .attach('file', Buffer.from('x'), {
          filename: 'evil.exe',
          contentType: 'text/plain',
        })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/leases')
        .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
          filename: 'large.txt',
          contentType: 'text/plain',
        })
        .expect(413);
      await request(app.getHttpServer())
        .post('/api/issues')
        .field('unitId', 'UNKNOWN')
        .attach('photos', 'test-data/photos/mc-b-1204-ac-leak.svg')
        .expect(404);
      await request(app.getHttpServer())
        .patch(
          `/api/leases/${problematic.id}/fields/${problematic.fields[0].id}`,
        )
        .send({ status: 'PENDING', unexpected: true })
        .expect(400);
      await request(app.getHttpServer())
        .patch(
          `/api/leases/${problematic.id}/fields/${problematic.fields[0].id}`,
        )
        .send({ status: 'ACCEPTED', value: { unsafe: 'object' } })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/api/work-orders/nonexistent`)
        .send({ status: 'ACCEPTED' })
        .expect(404);
    });
  },
);
