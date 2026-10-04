import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  StubVisionModelProvider,
  StubLeaseModelProvider,
} from '../apps/api/src/agents';
import { TextDocumentParser } from '../apps/api/src/parsers';
import { validateFile } from '../apps/api/src/storage';
const photo = (name: string, id: string) => ({
  id,
  filename: name,
  buffer: readFileSync(`test-data/photos/${name}`),
});
describe('agent boundaries', () => {
  it('derives rent with input evidence and keeps contradictory stated amounts', async () => {
    const provider = new StubLeaseModelProvider();
    const extract = async (text: string) =>
      provider.extract({
        filename: 'rent.txt',
        chunks: await new TextDocumentParser().parse(Buffer.from(text)),
      });
    const annual = await extract('Annual Rent:\nQAR 102,000');
    expect(annual.find((f) => f.key === 'monthlyRent')?.value).toBe('8500.00');
    expect(
      annual.find((f) => f.key === 'monthlyRent')?.sources[0].excerpt,
    ).toContain('Derived monthly rent');
    expect(annual.find((f) => f.key === 'rentFrequency')?.value).toBe('ANNUAL');
    const monthly = await extract('Monthly Rent:\nQAR 8,500');
    expect(monthly.find((f) => f.key === 'annualRent')?.value).toBe(
      '102000.00',
    );
    const inconsistent = await extract(
      'Monthly Rent:\nQAR 8,500\nAnnual Rent:\nQAR 100,000',
    );
    expect(inconsistent.find((f) => f.key === 'annualRent')?.value).toBe(
      '100000',
    );
  });
  it('leaves an ambiguous unit clause and oversized money unknown', async () => {
    const result = await new StubLeaseModelProvider().extract({
      filename: 'uncertain.txt',
      chunks: await new TextDocumentParser().parse(
        Buffer.from(
          'Unit: MC-B-1204 or MC-B-1205\nMonthly Rent:\nQAR 999999999999999999999999999999',
        ),
      ),
    });
    expect(result.find((f) => f.key === 'unit')?.value).toBeNull();
    expect(result.find((f) => f.key === 'monthlyRent')?.value).toBeNull();
  });
  it('recognizes fixture bytes and links each finding to its photo', async () => {
    const provider = new StubVisionModelProvider();
    const result = await provider.assess({
      unitId: 'MC-B-1204',
      photos: [
        photo('mc-b-1204-ac-leak.svg', 'ac'),
        photo('mc-b-1204-wall-damage.svg', 'wall'),
      ],
    });
    expect(result.condition).toBe('WORN');
    expect(result.assets).toHaveLength(2);
    expect(result.damages).toHaveLength(4);
    expect(result.damages[0].photoIds).toEqual(['ac']);
    expect(result.damages[2].photoIds).toEqual(['wall']);
    expect(result.photoIds).toEqual(['ac', 'wall']);
  });
  it('does not infer arbitrary image content or trust a fixture filename', async () => {
    const result = await new StubVisionModelProvider().assess({
      unitId: 'MC-B-1204',
      photos: [
        {
          id: 'unknown',
          filename: 'mc-b-1204-ac-leak.svg',
          buffer: Buffer.from('arbitrary'),
        },
      ],
    });
    expect(result.condition).toBe('UNCERTAIN');
    expect(result.assets).toEqual([]);
    expect(result.damages).toEqual([]);
    expect(result.summary).toContain('could not be determined');
  });
  it('keeps arbitrary text unknown and matches only explicit unit IDs', async () => {
    const provider = new StubLeaseModelProvider();
    for (const text of [
      'A lease with no known structure',
      'Unit: Apartment 1204',
      'Unit: MC-B-1204\nUnit: MC-B-1205',
    ]) {
      const result = await provider.extract({
        filename: 'arbitrary.txt',
        chunks: await new TextDocumentParser().parse(Buffer.from(text)),
      });
      expect(result.find((f) => f.key === 'unit')?.value).toBeNull();
    }
  });
  it('blocks active SVG, spoofed types and path traversal', async () => {
    const fake = (buffer: Buffer, name: string, mimetype: string) =>
      ({ buffer, originalname: name, mimetype }) as Express.Multer.File;
    await expect(
      validateFile(
        fake(
          Buffer.from('<svg><script>alert(1)</script></svg>'),
          'evil.svg',
          'image/svg+xml',
        ),
        'image',
      ),
    ).rejects.toThrow();
    await expect(
      validateFile(
        fake(Buffer.from('not pdf'), 'lease.pdf', 'application/pdf'),
        'lease',
      ),
    ).rejects.toThrow();
    const stored = await validateFile(
      fake(Buffer.from('plain text'), '../../lease.txt', 'text/plain'),
      'lease',
    );
    expect(stored.filename).toBe('lease.txt');
    expect(stored.storageKey).not.toContain('..');
  });
});
