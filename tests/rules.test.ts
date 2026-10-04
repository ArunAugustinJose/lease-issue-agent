import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RulesEngine, monthsBetween } from '../apps/api/src/rules';
import { StubLeaseModelProvider } from '../apps/api/src/agents';
import { TextDocumentParser } from '../apps/api/src/parsers';
import { mayConfirmLease } from '../apps/api/src/occupancy';
import { normalizeOverride } from '../apps/api/src/responses';
import type { Extraction, FieldKey, Value } from '@marina/contracts';
const engine = new RulesEngine();
async function fixture(name = 'sample-lease.txt') {
  return new StubLeaseModelProvider().extract({
    filename: name,
    chunks: await new TextDocumentParser().parse(
      readFileSync(`test-data/leases/${name}`),
    ),
  });
}
function check(
  fields: Extraction[],
  rule: string,
  overrides: Partial<Record<FieldKey, Value>> = {},
  unit: { id: string; status: string } | null = {
    id: 'MC-B-1204',
    status: 'AVAILABLE',
  },
) {
  return engine
    .validate({
      fields: fields.map((f) => ({
        ...f,
        value: f.key in overrides ? overrides[f.key]! : f.value,
      })),
      unit,
    })
    .find((r) => r.ruleId === rule)!;
}
describe('deterministic rules', () => {
  it('extracts fixture and calculates all seven passes with source evidence', async () => {
    const fields = await fixture();
    const results = engine.validate({
      fields,
      unit: { id: 'MC-B-1204', status: 'AVAILABLE' },
    });
    expect(results).toHaveLength(7);
    expect(results.every((r) => r.status === 'PASS')).toBe(true);
    expect(fields.every((f) => f.sources.length)).toBe(true);
    expect(
      fields.flatMap((f) => f.sources).every((s) => s.page === undefined),
    ).toBe(true);
  });
  it('R1 uses decimal comparisons and handles unknown', async () => {
    const f = await fixture();
    expect(check(f, 'R1', { deposit: '8499.99' }).status).toBe('FAIL');
    expect(check(f, 'R1', { deposit: '8500.00' }).status).toBe('PASS');
    expect(check(f, 'R1', { monthlyRent: null }).status).toBe(
      'NOT_DETERMINABLE',
    );
  });
  it('R2 requires an actual escalation mechanism', async () => {
    const f = await fixture();
    expect(
      check(f, 'R2', { escalation: 'To be mutually agreed.' }).status,
    ).toBe('FAIL');
    expect(
      check(f, 'R2', { escalation: 'Upon renewal increase by CPI.' }).status,
    ).toBe('PASS');
    expect(check(f, 'R2', { escalation: null }).status).toBe(
      'NOT_DETERMINABLE',
    );
  });
  it('R3 enforces the 36-month boundary', async () => {
    const f = await fixture();
    expect(check(f, 'R3', { termMonths: 36 }).status).toBe('PASS');
    expect(check(f, 'R3', { termMonths: 37 }).status).toBe('FAIL');
    expect(check(f, 'R3', { termMonths: null }).status).toBe(
      'NOT_DETERMINABLE',
    );
  });
  it('R4 handles inclusive end dates, wrong order and mismatch', async () => {
    const f = await fixture();
    expect(monthsBetween('2027-01-01', '2027-12-31')).toBe(12);
    expect(monthsBetween('2027-01-01', '2028-01-01')).toBe(12);
    expect(check(f, 'R4', { expiry: '2026-12-31' }).status).toBe('FAIL');
    expect(check(f, 'R4', { termMonths: 11 }).status).toBe('FAIL');
    expect(check(f, 'R4', { expiry: '2027-02-30' }).status).toBe('FAIL');
    expect(check(f, 'R4', { expiry: null }).status).toBe('NOT_DETERMINABLE');
  });
  it('R5 checks parties and signatures', async () => {
    const f = await fixture();
    expect(check(f, 'R5', { tenantSigned: false }).status).toBe('FAIL');
    expect(check(f, 'R5', { tenant: null }).status).toBe('NOT_DETERMINABLE');
    expect(check(f, 'R5', { landlordSigned: null }).status).toBe(
      'NOT_DETERMINABLE',
    );
  });
  it('R6 reconciles money exactly', async () => {
    const f = await fixture();
    expect(check(f, 'R6', { annualRent: '101999.99' }).status).toBe('FAIL');
    expect(check(f, 'R6', { annualRent: null }).status).toBe(
      'NOT_DETERMINABLE',
    );
  });
  it('R7 distinguishes available, occupied, absent and unknown units', async () => {
    const f = await fixture();
    expect(check(f, 'R7').status).toBe('PASS');
    expect(
      check(f, 'R7', {}, { id: 'MC-B-1204', status: 'OCCUPIED' }).status,
    ).toBe('FAIL');
    expect(check(f, 'R7', {}, null).status).toBe('FAIL');
    expect(check(f, 'R7', { unit: null }, null).status).toBe(
      'NOT_DETERMINABLE',
    );
  });
  it('calculates the problematic fixture failures', async () => {
    const fields = await fixture('problematic-lease.txt');
    const results = engine.validate({
      fields,
      unit: { id: 'MC-B-1205', status: 'OCCUPIED' },
    });
    expect(
      results.filter((r) => r.status === 'FAIL').map((r) => r.ruleId),
    ).toEqual(['R1', 'R2', 'R3', 'R5', 'R6', 'R7']);
  });
});
describe('occupancy safeguards', () => {
  const ready = {
    linked: false,
    unitAvailable: true,
    fields: Array.from({ length: 16 }, () => ({
      reviewStatus: 'ACCEPTED' as const,
    })),
    flags: [],
    rules: Array.from({ length: 7 }, () => ({ status: 'PASS' as const })),
  };
  it('requires all reviews and rules before confirmation', () => {
    expect(mayConfirmLease(ready)).toBe(true);
    expect(mayConfirmLease({ ...ready, unitAvailable: false })).toBe(false);
    expect(mayConfirmLease({ ...ready, linked: true })).toBe(false);
    expect(
      mayConfirmLease({ ...ready, fields: [{ reviewStatus: 'PENDING' }] }),
    ).toBe(false);
    expect(
      mayConfirmLease({ ...ready, flags: [{ reviewStatus: 'PENDING' }] }),
    ).toBe(false);
    expect(mayConfirmLease({ ...ready, rules: [{ status: 'FAIL' }] })).toBe(
      false,
    );
  });
  it('normalizes owner money and rejects invalid dates', () => {
    expect(normalizeOverride('monthlyRent', '8750')).toBe('8750.00');
    expect(() => normalizeOverride('deposit', '8.001')).toThrow();
    expect(() => normalizeOverride('expiry', '2027-02-30')).toThrow();
  });
});
