import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  fieldKeys,
  type Extraction,
  type FieldKey,
  type Value,
} from '@marina/contracts';
import type { Chunk } from './parsers';
import Decimal from 'decimal.js';
import { normalizeMatchingText } from './unit-matching';
export interface LeaseModelProvider {
  extract(context: {
    filename: string;
    chunks: Chunk[];
  }): Promise<Extraction[]>;
}
const headers: Record<FieldKey, string> = {
  landlord: 'Landlord:',
  tenant: 'Tenant:',
  unit: 'Unit:',
  commencement: 'Commencement Date:',
  expiry: 'Expiry Date:',
  termMonths: 'Lease Term:',
  rentAmount: 'Monthly Rent:',
  rentFrequency: 'Monthly Rent:',
  monthlyRent: 'Monthly Rent:',
  annualRent: 'Annual Rent:',
  deposit: 'Security Deposit:',
  escalation: 'Rent Escalation:',
  renewal: 'Renewal:',
  termination: 'Termination:',
  landlordSigned: 'Landlord Signature:',
  tenantSigned: 'Tenant Signature:',
};
const monetary = new Set<FieldKey>([
  'rentAmount',
  'monthlyRent',
  'annualRent',
  'deposit',
]);
function fieldLabel(text: string, aliases: string[]): string | undefined {
  const normalized = normalizeMatchingText(text);
  return aliases.find(
    (label) =>
      normalized === normalizeMatchingText(label) ||
      new RegExp(`^${normalizeMatchingText(label)}\\s*:`).test(normalized),
  );
}
export class StubLeaseModelProvider implements LeaseModelProvider {
  async extract({
    filename,
    chunks,
  }: {
    filename: string;
    chunks: Chunk[];
  }): Promise<Extraction[]> {
    const fields: Extraction[] = fieldKeys.map((key) => {
      const annualOnly =
        !chunks.some((c) => fieldLabel(c.text, ['Monthly Rent'])) &&
        chunks.some((c) => fieldLabel(c.text, ['Annual Rent']));
      const header =
        annualOnly && ['rentAmount', 'rentFrequency'].includes(key)
          ? 'Annual Rent:'
          : headers[key];
      const aliases =
        key === 'unit'
          ? [
              'Unit',
              'Unit ID',
              'Unit Number',
              'Apartment',
              'Apartment No',
              'Premises',
            ]
          : [header.slice(0, -1)];
      const hits = chunks
        .map((c, i) => ({
          c,
          i,
          label: fieldLabel(c.text, aliases),
        }))
        .filter(({ label }) => label !== undefined);
      if (hits.length !== 1)
        return {
          key,
          value: null,
          confidence: 0,
          sources: hits.map(({ c }) => ({
            filename,
            chunkId: c.id,
            ...c.locator,
            excerpt: c.text,
            confidence: 0,
          })),
        };
      const { c, i, label } = hits[0];
      let source = c;
      let raw = c.text
        .replace(
          new RegExp(`^\\s*${label!.replace(/ /g, '\\s+')}\\s*:?\\s*`, 'i'),
          '',
        )
        .trim();
      if (!raw) {
        const next = chunks[i + 1];
        // A label in a table may only consume its own next cell, never the next row/table.
        const row = c.id.match(/^(.*table-\d+-row-\d+)-col-(\d+)-/);
        const nextRow = next?.id.match(/^(.*table-\d+-row-\d+)-col-(\d+)-/);
        if (
          next &&
          (!row ||
            (nextRow &&
              row[1] === nextRow[1] &&
              [Number(row[2]), Number(row[2]) + 1].includes(
                Number(nextRow[2]),
              )))
        ) {
          source = next;
          raw = source.text;
        }
      }
      if (key === 'landlordSigned' || key === 'tenantSigned') {
        source =
          chunks.slice(i + 1, i + 4).find((x) => /^Signed:/i.test(x.text)) ?? c;
        raw = source.text;
      }
      let value: Value = raw;
      if (key === 'unit') {
        const identifiers = [
          ...new Set(
            normalizeMatchingText(raw)
              .toUpperCase()
              .match(/\b[A-Z]{2,10}-[A-Z0-9]{1,10}-\d{4}\b/g) ?? [],
          ),
        ];
        value = identifiers.length === 1 ? identifiers[0] : null;
      }
      if (monetary.has(key))
        value =
          raw.match(/QAR\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1].replaceAll(',', '') ??
          null;
      if (key === 'rentFrequency')
        value = /QAR\s*[\d,]+/i.test(raw)
          ? annualOnly
            ? 'ANNUAL'
            : 'MONTHLY'
          : null;
      if (key === 'termMonths')
        value = /^\d+ months$/i.test(raw) ? parseInt(raw) : null;
      if (key === 'commencement' || key === 'expiry') {
        const match = raw.match(
          /^(\d{2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/,
        );
        value = match
          ? `${match[3]}-${String(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(match[2]) + 1).padStart(2, '0')}-${match[1]}`
          : null;
      }
      if (key === 'landlordSigned' || key === 'tenantSigned')
        value = /^Signed: Yes$/i.test(raw)
          ? true
          : /^Signed: No$/i.test(raw)
            ? false
            : null;
      if (
        /^(Not specified\.|END OF AGREEMENT)$/i.test(raw) ||
        Object.values(headers).includes(raw)
      )
        value = null;
      if (
        monetary.has(key) &&
        value !== null &&
        new Decimal(String(value)).gt('9999999999999999.99')
      )
        value = null;
      const confidence = value === null ? 0 : 0.85;
      return {
        key,
        value,
        confidence,
        sources:
          value === null
            ? []
            : [
                {
                  filename,
                  chunkId: source.id,
                  ...source.locator,
                  excerpt: (source === c
                    ? c.text
                    : `${c.text}\n${source.text}`
                  ).slice(0, 600),
                  confidence,
                },
              ],
      };
    });
    const monthly = fields.find((f) => f.key === 'monthlyRent')!;
    const annual = fields.find((f) => f.key === 'annualRent')!;
    // Derivations retain input evidence; contradictory stated figures are never replaced.
    if (
      monthly.value !== null &&
      annual.value === null &&
      !chunks.some((c) => fieldLabel(c.text, ['Annual Rent']))
    ) {
      const derived = new Decimal(String(monthly.value)).mul(12);
      if (derived.lte('9999999999999999.99')) {
        annual.value = derived.toFixed(2);
        annual.sources = monthly.sources.map((s) => ({
          ...s,
          excerpt: s.excerpt + ' [Derived annual rent = monthly × 12]',
        }));
        annual.confidence = monthly.confidence;
      }
    }
    if (
      annual.value !== null &&
      monthly.value === null &&
      !chunks.some((c) => fieldLabel(c.text, ['Monthly Rent']))
    ) {
      const derived = new Decimal(String(annual.value)).div(12);
      if (derived.decimalPlaces() <= 2) {
        monthly.value = derived.toFixed(2);
        monthly.sources = annual.sources.map((s) => ({
          ...s,
          excerpt: s.excerpt + ' [Derived monthly rent = annual ÷ 12]',
        }));
        monthly.confidence = annual.confidence;
      }
    }
    return fields;
  }
}
export class LeaseDocumentAgent {
  constructor(private provider: LeaseModelProvider) {}
  async run(filename: string, chunks: Chunk[]) {
    const fields = await this.provider.extract({ filename, chunks });
    return {
      fields,
      provider: 'stub — deterministic text demo; owner verification required',
    };
  }
}
export interface VisionPhoto {
  id: string;
  buffer: Buffer;
  filename: string;
}
export interface VisionOutput {
  condition: string;
  summary: string;
  assets: { label: string; photoIds: string[] }[];
  damages: { label: string; photoIds: string[] }[];
  title: string;
  description: string;
  photoIds: string[];
}
export interface VisionModelProvider {
  assess(context: {
    unitId: string;
    photos: VisionPhoto[];
  }): Promise<VisionOutput>;
}
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
export class StubVisionModelProvider implements VisionModelProvider {
  async assess({
    unitId,
    photos,
  }: {
    unitId: string;
    photos: VisionPhoto[];
  }): Promise<VisionOutput> {
    const fixtures = ['mc-b-1204-ac-leak.svg', 'mc-b-1204-wall-damage.svg'].map(
      (name) => ({
        name,
        digest: hash(
          readFileSync(
            resolve(
              process.env.PROJECT_ROOT ?? process.cwd(),
              'test-data/photos',
              name,
            ),
          ),
        ),
      }),
    );
    const assets: VisionOutput['assets'] = [],
      damages: VisionOutput['damages'] = [];
    let unknown = 0;
    for (const p of photos) {
      const fixture = fixtures.find((f) => f.digest === hash(p.buffer));
      if (!fixture) {
        unknown++;
        continue;
      }
      const ac = fixture.name.includes('ac-leak');
      assets.push({
        label: ac ? 'Wall-mounted air conditioning unit' : 'Interior wall',
        photoIds: [p.id],
      });
      for (const label of ac
        ? [
            'Visible water staining below AC',
            'Possible leak evidence; cause unconfirmed',
          ]
        : ['Visible wall crack', 'Worn paint'])
        damages.push({ label, photoIds: [p.id] });
    }
    const photoIds = damages.length
      ? [...new Set(damages.flatMap((d) => d.photoIds))]
      : photos.map((p) => p.id);
    return {
      condition: unknown ? 'UNCERTAIN' : 'WORN',
      summary: `Stub demo analysis. ${unknown ? `${unknown} image(s) are unrecognized; their contents and condition could not be determined. ` : ''}${damages.length ? 'Recognized illustrated fixture evidence; no functional or hidden condition is established.' : 'Owner inspection is required; no visible findings are asserted.'}`,
      assets,
      damages,
      title:
        assets.length === 1
          ? assets[0].label.includes('conditioning')
            ? 'Inspect AC leak and water staining'
            : 'Inspect and repair wall damage'
          : assets.length
            ? 'Inspect reported AC and wall damage'
            : 'Review uploaded condition evidence',
      description: damages.length
        ? `Inspect ${unitId}: ${damages.map((d) => d.label.toLowerCase()).join('; ')}. Verify the condition and cause before repairs.`
        : `Review photos for ${unitId}. The stub provider cannot assess arbitrary images; inspect and describe any issue before accepting.`,
      photoIds,
    };
  }
}
export class VisionIssueAgent {
  constructor(private provider: VisionModelProvider) {}
  run(unitId: string, photos: VisionPhoto[]) {
    return this.provider.assess({ unitId, photos });
  }
}
