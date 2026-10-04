import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import type {
  FieldKey,
  IssueView,
  LeaseView,
  Source,
  UnitView,
  Value,
} from '@marina/contracts';
export const leaseInclude = {
  document: true,
  fields: { include: { sources: true } },
  flags: { include: { sources: true } },
  validations: { include: { sources: true } },
} satisfies Prisma.LeaseInclude;
export const issueInclude = {
  photos: true,
  assessment: true,
  assets: { include: { photos: true } },
  damages: { include: { photos: true } },
  workOrder: { include: { photos: true } },
} satisfies Prisma.IssueReportInclude;
type LeaseRecord = Prisma.LeaseGetPayload<{ include: typeof leaseInclude }>;
type IssueRecord = Prisma.IssueReportGetPayload<{
  include: typeof issueInclude;
}>;
type UnitRecord = Prisma.UnitGetPayload<{
  include: {
    building: { include: { property: true } };
    _count: { select: { leases: true; candidateLeases: true; issues: true } };
  };
}>;
export const json = (v: Value) => (v === null ? Prisma.JsonNull : v);
const value = (v: Prisma.JsonValue): Value =>
  typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number'
    ? v
    : null;
export const monetary = new Set([
  'rentAmount',
  'monthlyRent',
  'annualRent',
  'deposit',
]);
export function normalizeOverride(key: FieldKey, v: Value): Value {
  if (v === null) return null;
  if (monetary.has(key)) {
    try {
      if (typeof v === 'boolean' || String(v).trim() === '') throw new Error();
      const amount = new Decimal(v);
      if (
        !amount.isFinite() ||
        amount.lt(0) ||
        amount.gt('9999999999999999.99') ||
        amount.decimalPlaces() > 2
      )
        throw new Error();
      return amount.toFixed(2);
    } catch {
      throw new BadRequestException(
        'Enter a non-negative QAR amount with at most two decimal places.',
      );
    }
  }
  if (key === 'termMonths') {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > 1200)
      throw new BadRequestException(
        'Enter a whole-month term between 1 and 1200.',
      );
    return v;
  }
  if (key.endsWith('Signed')) {
    if (typeof v !== 'boolean')
      throw new BadRequestException('Signature status must be true or false.');
    return v;
  }
  if (typeof v !== 'string' || !v.trim() || v.length > 5000)
    throw new BadRequestException(
      'Enter a non-empty text value up to 5000 characters.',
    );
  if (key === 'commencement' || key === 'expiry') {
    const d = new Date(v + 'T00:00:00Z');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
      !Number.isFinite(d.getTime()) ||
      d.toISOString().slice(0, 10) !== v
    )
      throw new BadRequestException('Enter a valid date in YYYY-MM-DD format.');
  }
  if (
    key === 'rentFrequency' &&
    !['MONTHLY', 'ANNUAL', 'QUARTERLY', 'WEEKLY', 'OTHER'].includes(v)
  )
    throw new BadRequestException(
      'Use MONTHLY, ANNUAL, QUARTERLY, WEEKLY or OTHER.',
    );
  return v.trim();
}
const toSource = (
  s: Prisma.LeaseSourceReferenceGetPayload<object>,
): Source => ({
  id: s.id,
  filename: s.filename,
  chunkId: s.chunkId,
  page: s.page,
  paragraph: s.paragraph,
  line: s.line,
  excerpt: s.excerpt,
  confidence: s.confidence,
});
export function leaseDto(l: LeaseRecord): LeaseView {
  return {
    id: l.id,
    unitId: l.unitId,
    candidateUnitId: l.candidateUnitId,
    linked: l.linked,
    processingStatus: l.processingStatus,
    provider: l.provider,
    filename: l.document?.filename ?? '',
    documentUrl: `/api/files/${l.document?.storageKey}`,
    fields: l.fields.map((f) => ({
      id: f.id,
      key: f.key as FieldKey,
      value: value(f.currentValue),
      originalValue: value(f.originalValue),
      currentValue: value(f.currentValue),
      confidence: f.confidence,
      overridden: f.overridden,
      reviewStatus: f.reviewStatus,
      sources: f.sources.map(toSource),
    })),
    flags: l.flags.map((f) => ({
      id: f.id,
      severity: f.severity,
      message: f.message,
      reviewStatus: f.reviewStatus,
      sources: f.sources.map(toSource),
    })),
    validations: l.validations
      .map((r) => ({
        id: r.id,
        ruleId: r.ruleId,
        description: r.description,
        severity: r.severity,
        status: r.status,
        reason: r.reason,
        values: r.values as Partial<Record<FieldKey, Value>>,
        sources: r.sources.map(toSource),
      }))
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId)),
    createdAt: l.createdAt.toISOString(),
  };
}
export function issueDto(i: IssueRecord): IssueView {
  if (!i.workOrder || !i.assessment) throw new Error('Incomplete issue');
  return {
    id: i.id,
    unitId: i.unitId,
    processingStatus: i.processingStatus,
    provider: i.provider,
    photos: i.photos.map((p) => ({
      id: p.id,
      filename: p.filename,
      url: `/api/files/${p.storageKey}`,
    })),
    condition: i.assessment.condition,
    summary: i.assessment.summary,
    assets: i.assets.map((a) => ({
      label: a.label,
      photoIds: a.photos.map((p) => p.id),
    })),
    damages: i.damages.map((a) => ({
      label: a.label,
      photoIds: a.photos.map((p) => p.id),
    })),
    workOrder: {
      id: i.workOrder.id,
      title: i.workOrder.title,
      description: i.workOrder.description,
      reviewStatus: i.workOrder.reviewStatus,
      photoIds: i.workOrder.photos.map((p) => p.id),
    },
    createdAt: i.createdAt.toISOString(),
  };
}
export const unitDto = (u: UnitRecord): UnitView => ({
  id: u.id,
  label: u.label,
  type: u.type,
  areaSqm: u.areaSqm.toString(),
  parkingBay: u.parkingBay,
  status: u.status,
  building: u.building.name,
  property: u.building.property.name,
  location: u.building.property.location,
  ownershipEntity: u.building.property.ownershipEntity,
  leaseCount: u._count.leases + u._count.candidateLeases,
  issueCount: u._count.issues,
});
export const unitInclude = {
  building: { include: { property: true } },
  _count: { select: { leases: true, candidateLeases: true, issues: true } },
} as const;
