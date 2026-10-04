import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FieldKey, ReviewStatus, Value } from '@marina/contracts';
import { extname } from 'node:path';
import Decimal from 'decimal.js';
import { PrismaService } from './database';
import { LeaseDocumentAgent } from './agents';
import { RulesEngine } from './rules';
import {
  leaseInclude,
  leaseDto,
  json,
  monetary,
  normalizeOverride,
} from './responses';
import { validateFile, storeFiles, removeFiles } from './storage';
import { parseDocument } from './parsers';
import { mayConfirmLease } from './occupancy';
@Injectable()
export class LeasesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LeaseDocumentAgent) private readonly leaseAgent: LeaseDocumentAgent,
    @Inject(RulesEngine) private readonly rules: RulesEngine,
  ) {}
  async lease(id: string) {
    const lease = await this.db.lease.findUnique({
      where: { id },
      include: leaseInclude,
    });
    if (!lease) throw new NotFoundException('Lease not found.');
    return leaseDto(lease);
  }

  async uploadLease(file: Express.Multer.File) {
    const stored = await validateFile(file, 'lease');
    const chunks = await parseDocument(
      stored.buffer,
      extname(stored.filename).toLowerCase(),
    );
    const output = await this.leaseAgent.run(stored.filename, chunks);
    await storeFiles([stored]);
    try {
      const id = await this.db.$transaction(async (tx) => {
        const unitValue = output.fields.find((f) => f.key === 'unit')?.value;
        const unit =
          typeof unitValue === 'string'
            ? await tx.unit.findUnique({ where: { id: unitValue } })
            : null;
        const lease = await tx.lease.create({
          data: {
            candidateUnitId: unit?.id,
            provider: output.provider,
            rulesetVersion: '1.0',
          },
        });
        const document = await tx.leaseDocument.create({
          data: {
            leaseId: lease.id,
            filename: stored.filename,
            storageKey: stored.storageKey,
            mimeType: stored.mimeType,
          },
        });
        for (const f of output.fields) {
          const field = await tx.leaseExtractedField.create({
            data: {
              leaseId: lease.id,
              key: f.key,
              originalValue: json(f.value),
              currentValue: json(f.value),
              confidence: f.confidence,
              amount:
                monetary.has(f.key) && f.value !== null
                  ? String(f.value)
                  : null,
              currency: monetary.has(f.key) ? 'QAR' : null,
            },
          });
          for (const s of f.sources)
            await tx.leaseSourceReference.create({
              data: { ...s, fieldId: field.id, documentId: document.id },
            });
        }
        const loaded = await tx.lease.findUniqueOrThrow({
          where: { id: lease.id },
          include: leaseInclude,
        });
        const fields = leaseDto(loaded).fields;
        const results = this.rules.validate({ fields, unit });
        await this.saveRules(tx, lease.id, results);
        for (const f of fields) {
          if (f.currentValue === null || !f.sources.length)
            await tx.leaseFlag.create({
              data: {
                leaseId: lease.id,
                severity: 'high',
                message: `${f.key}: missing information or source; owner review required.`,
                sources: { connect: f.sources.map((s) => ({ id: s.id! })) },
              },
            });
        }
        for (const r of results.filter((r) => r.status !== 'PASS'))
          await tx.leaseFlag.create({
            data: {
              leaseId: lease.id,
              severity: r.severity,
              message: `${r.ruleId}: ${r.reason}`,
              sources: { connect: r.sources.map((s) => ({ id: s.id! })) },
            },
          });
        if (
          fields.some(
            (f) =>
              ['monthlyRent', 'deposit'].includes(f.key) &&
              f.currentValue !== null &&
              new Decimal(String(f.currentValue)).lte(0),
          )
        )
          await tx.leaseFlag.create({
            data: {
              leaseId: lease.id,
              severity: 'high',
              message: 'Zero rent or deposit requires owner attention.',
            },
          });
        for (const f of fields.filter(
          (f) =>
            ['renewal', 'termination'].includes(f.key) &&
            (!f.currentValue ||
              /in accordance with the agreement|not specified|mutually agreed/i.test(
                String(f.currentValue),
              )),
        ))
          await tx.leaseFlag.create({
            data: {
              leaseId: lease.id,
              severity: 'medium',
              message: `${f.key}: clause is missing or ambiguous.`,
              sources: { connect: f.sources.map((s) => ({ id: s.id! })) },
            },
          });
        return lease.id;
      });
      return this.lease(id);
    } catch (error) {
      await removeFiles([stored.storageKey]);
      throw error;
    }
  }
  private async saveRules(
    tx: Prisma.TransactionClient,
    leaseId: string,
    results: ReturnType<RulesEngine['validate']>,
  ) {
    for (const r of results) {
      const { sources, ...data } = r;
      await tx.leaseRuleValidation.upsert({
        where: { leaseId_ruleId: { leaseId, ruleId: r.ruleId } },
        create: {
          ...data,
          values: data.values as Prisma.InputJsonObject,
          leaseId,
          sources: { connect: sources.map((s) => ({ id: s.id! })) },
        },
        update: {
          ...data,
          values: data.values as Prisma.InputJsonObject,
          sources: { set: sources.map((s) => ({ id: s.id! })) },
        },
      });
    }
  }
  private async reconcile(tx: Prisma.TransactionClient, leaseId: string) {
    const lease = await tx.lease.findUniqueOrThrow({
      where: { id: leaseId },
      include: leaseInclude,
    });
    const fields = leaseDto(lease).fields;
    const unitValue = fields.find((f) => f.key === 'unit');
    const unit =
      typeof unitValue?.currentValue === 'string'
        ? await tx.unit.findUnique({ where: { id: unitValue.currentValue } })
        : null;
    if (!lease.linked)
      await tx.lease.update({
        where: { id: leaseId },
        data: { candidateUnitId: unit?.id ?? null },
      });
    const results = this.rules.validate({
      fields: fields.map((f) => ({
        ...f,
        value: f.reviewStatus === 'REJECTED' ? null : f.currentValue,
      })),
      unit,
      linkedUnitId: lease.linked ? lease.unitId : null,
    });
    await this.saveRules(tx, leaseId, results);
    if (
      unit &&
      mayConfirmLease({
        linked: lease.linked,
        unitAvailable: unit.status === 'AVAILABLE',
        fields,
        flags: lease.flags,
        rules: results,
      })
    ) {
      const changed = await tx.unit.updateMany({
        where: { id: unit.id, status: 'AVAILABLE' },
        data: { status: 'OCCUPIED' },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'This unit was occupied by another lease. Review its availability.',
        );
      await tx.lease.update({
        where: { id: leaseId },
        data: { unitId: unit.id, candidateUnitId: null, linked: true },
      });
    }
  }
  async reviewField(
    leaseId: string,
    fieldId: string,
    status: ReviewStatus,
    override?: Value,
  ) {
    try {
      await this.db.$transaction(
        async (tx) => {
          const field = await tx.leaseExtractedField.findFirst({
            where: { id: fieldId, leaseId },
            include: { lease: true },
          });
          if (!field)
            throw new NotFoundException('Field not found for this lease.');
          if (field.lease.linked)
            throw new ConflictException(
              'A confirmed lease is locked to preserve its occupancy decision.',
            );
          const normalized =
            override === undefined
              ? undefined
              : normalizeOverride(field.key as FieldKey, override);
          if (normalized !== undefined && status !== 'ACCEPTED')
            throw new BadRequestException('Overrides must be accepted.');
          await tx.leaseExtractedField.update({
            where: { id: fieldId },
            data: {
              reviewStatus: status,
              reviewedAt: new Date(),
              ...(normalized === undefined
                ? {}
                : {
                    currentValue: json(normalized),
                    overridden: true,
                    amount:
                      monetary.has(field.key) && normalized !== null
                        ? String(normalized)
                        : null,
                  }),
            },
          });
          await this.reconcile(tx, leaseId);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException(
          'Another review changed this lease. Refresh and retry.',
        );
      throw error;
    }
    return this.lease(leaseId);
  }
  async reviewFlag(leaseId: string, flagId: string, status: ReviewStatus) {
    await this.db.$transaction(
      async (tx) => {
        const flag = await tx.leaseFlag.findFirst({
          where: { id: flagId, leaseId },
        });
        if (!flag) throw new NotFoundException('Warning not found.');
        await tx.leaseFlag.update({
          where: { id: flagId },
          data: { reviewStatus: status, reviewedAt: new Date() },
        });
        await this.reconcile(tx, leaseId);
      },
      { isolationLevel: 'Serializable' },
    );
    return this.lease(leaseId);
  }
}
