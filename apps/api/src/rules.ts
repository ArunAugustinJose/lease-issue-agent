import Decimal from 'decimal.js';
import type {
  Extraction,
  FieldKey,
  RuleResult,
  Value,
} from '@marina/contracts';
import metadata from '../../../config/rules.json';
export interface RuleContext {
  fields: Extraction[];
  unit: { id: string; status: string } | null;
  linkedUnitId?: string | null;
}
export interface RuleValidator {
  ruleId: string;
  keys: FieldKey[];
  evaluate(
    values: Partial<Record<FieldKey, Value>>,
    context: RuleContext,
  ): { status: RuleResult['status']; reason: string };
}
const unknown = (reason: string) => ({
  status: 'NOT_DETERMINABLE' as const,
  reason,
});
const result = (pass: boolean, reason: string) => ({
  status: pass ? ('PASS' as const) : ('FAIL' as const),
  reason,
});
const money = (value: Value | undefined) => {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    String(value).trim() === ''
  )
    return null;
  try {
    const d = new Decimal(value);
    return d.isFinite() && d.gte(0) && d.decimalPlaces() <= 2 ? d : null;
  } catch {
    return null;
  }
};
export function monthsBetween(start: string, end: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
    return null;
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  if (
    !Number.isFinite(s.getTime()) ||
    !Number.isFinite(e.getTime()) ||
    s.toISOString().slice(0, 10) !== start ||
    e.toISOString().slice(0, 10) !== end ||
    e <= s
  )
    return null;
  // Inclusive lease end: 1 Jan–31 Dec is twelve months. Also accept anniversary-exclusive ends.
  const exclusive = new Date(e);
  exclusive.setUTCDate(exclusive.getUTCDate() + 1);
  const count = (d: Date) => {
    const n =
      (d.getUTCFullYear() - s.getUTCFullYear()) * 12 +
      d.getUTCMonth() -
      s.getUTCMonth();
    const target = new Date(s);
    target.setUTCMonth(s.getUTCMonth() + n);
    if (target.getUTCMonth() !== d.getUTCMonth()) target.setUTCDate(0);
    return target.getTime() === d.getTime() ? n : null;
  };
  return count(exclusive) ?? count(e);
}
export const validators: RuleValidator[] = [
  {
    ruleId: 'R1',
    keys: ['deposit', 'monthlyRent'],
    evaluate: (v) => {
      const d = money(v.deposit),
        m = money(v.monthlyRent);
      return !d || !m || m.lte(0)
        ? unknown('A valid deposit and monthly rent are required.')
        : result(
            d.gte(m),
            `QAR ${d.toFixed(2)} deposit compared with QAR ${m.toFixed(2)} monthly rent.`,
          );
    },
  },
  {
    ruleId: 'R2',
    keys: ['escalation'],
    evaluate: (v) => {
      if (typeof v.escalation !== 'string' || !v.escalation.trim())
        return unknown('Escalation clause is missing.');
      return result(
        /\d+(?:\.\d+)?\s*%|consumer price index|\bCPI\b|fixed increase of QAR\s*\d+/i.test(
          v.escalation,
        ) && !/mutually agreed|not specified/i.test(v.escalation),
        'A defined percentage, fixed increment or index mechanism is required.',
      );
    },
  },
  {
    ruleId: 'R3',
    keys: ['termMonths'],
    evaluate: (v) =>
      typeof v.termMonths === 'number' &&
      Number.isInteger(v.termMonths) &&
      v.termMonths > 0
        ? result(
            v.termMonths <= 36,
            `Fixed term is ${v.termMonths} months; limit is 36.`,
          )
        : unknown('A positive, whole-month fixed term is required.'),
  },
  {
    ruleId: 'R4',
    keys: ['commencement', 'expiry', 'termMonths'],
    evaluate: (v) => {
      if (
        typeof v.commencement !== 'string' ||
        typeof v.expiry !== 'string' ||
        typeof v.termMonths !== 'number'
      )
        return unknown('Start, end and stated term are required.');
      const n = monthsBetween(v.commencement, v.expiry);
      return result(
        n !== null && n === v.termMonths,
        `Dates ${v.commencement} to ${v.expiry}; calculated term ${n ?? 'invalid or not whole months'}, stated ${v.termMonths}.`,
      );
    },
  },
  {
    ruleId: 'R5',
    keys: ['landlord', 'tenant', 'landlordSigned', 'tenantSigned'],
    evaluate: (v) => {
      if (v.landlordSigned === false || v.tenantSigned === false)
        return result(
          false,
          'Both parties must sign; at least one signature is missing.',
        );
      if (
        !v.landlord ||
        !v.tenant ||
        typeof v.landlordSigned !== 'boolean' ||
        typeof v.tenantSigned !== 'boolean'
      )
        return unknown(
          'Both named parties and signature statuses are required.',
        );
      return result(
        true,
        'Both parties are identified and signatures are stated present. Stub signature statements require owner verification.',
      );
    },
  },
  {
    ruleId: 'R6',
    keys: ['monthlyRent', 'annualRent'],
    evaluate: (v) => {
      const m = money(v.monthlyRent),
        a = money(v.annualRent);
      return !m || !a || m.lte(0)
        ? unknown('Valid monthly and annual rent are required.')
        : result(
            a.eq(m.mul(12)),
            `Annual QAR ${a.toFixed(2)} compared with monthly × 12 = QAR ${m.mul(12).toFixed(2)}.`,
          );
    },
  },
  {
    ruleId: 'R7',
    keys: ['unit'],
    evaluate: (v, c) => {
      if (!v.unit)
        return unknown('No explicit unit identifier could be determined.');
      if (!c.unit)
        return result(
          false,
          'The explicit unit identifier does not exist in owner records.',
        );
      if (c.linkedUnitId === c.unit.id)
        return result(
          true,
          'Unit was available when this lease was confirmed and linked.',
        );
      return result(
        c.unit.status === 'AVAILABLE',
        `${c.unit.id} is ${c.unit.status.toLowerCase()}; a new lease requires availability.`,
      );
    },
  },
];
export class RulesEngine {
  constructor(private readonly registry: RuleValidator[] = validators) {}
  validate(context: RuleContext): RuleResult[] {
    const all = Object.fromEntries(context.fields.map((f) => [f.key, f.value]));
    return metadata.rules.map((rule) => {
      const validator = this.registry.find((v) => v.ruleId === rule.id);
      if (!validator) throw new Error('Missing validator ' + rule.id);
      const values = Object.fromEntries(
        validator.keys.map((k) => [k, all[k] ?? null]),
      );
      return {
        ruleId: rule.id,
        description: rule.description,
        severity: rule.severity,
        ...validator.evaluate(values, context),
        values,
        sources: context.fields
          .filter((f) => validator.keys.includes(f.key))
          .flatMap((f) => f.sources),
      };
    });
  }
}
