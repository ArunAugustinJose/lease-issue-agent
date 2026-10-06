import { describe, expect, it, vi } from 'vitest';
import {
  DocxDocumentParser,
  TextDocumentParser,
  PdfDocumentParser,
  parseDocument,
} from '../apps/api/src/parsers';
import { StubLeaseModelProvider } from '../apps/api/src/agents';
import {
  matchLeaseUnit,
  normalizeMatchingText,
  type KnownUnit,
} from '../apps/api/src/unit-matching';
import { docx, paragraph, table } from './docx-fixture';
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    async getText() {
      return {
        pages: [
          { num: 1, text: 'Property: Marina Crest Residences' },
          { num: 2, text: '  Unit: MC–B–0902 / Apartment 0902\r\n' },
        ],
      };
    }
    async destroy() {}
  },
}));
const units: KnownUnit[] = [
  {
    id: 'MC-B-0902',
    label: 'Apartment 0902',
    building: {
      name: 'Tower B',
      property: { name: 'Marina Crest Residences' },
    },
  },
  {
    id: 'MC-A-0301',
    label: 'Apartment 0301',
    building: {
      name: 'Tower A',
      property: { name: 'Marina Crest Residences' },
    },
  },
];
const textChunks = (text: string) =>
  new TextDocumentParser().parse(Buffer.from(text));
describe('document parsing and conservative unit matching', () => {
  it.each([
    'Unit: MC-B-0902 / Apartment 0902',
    'Unit ID: mc-b-0902',
    'Unit Number : MC–B–0902',
    'Premises:  MC-B-0902  ',
    'Apartment No: MC-B-0902',
  ])('recognizes normalized unit headings: %s', async (text) => {
    const chunks = await new DocxDocumentParser().parse(
      await docx(paragraph(text)),
    );
    const fields = await new StubLeaseModelProvider().extract({
      filename: 'lease.docx',
      chunks,
    });
    expect(fields.find((f) => f.key === 'unit')?.value).toBe('MC-B-0902');
    expect(matchLeaseUnit('lease.docx', chunks, units).matchedUnitId).toBe(
      'MC-B-0902',
    );
    expect(chunks[0].text).toBe(text);
  });
  it('reads separate cells and retains filename, cell locator and original excerpt', async () => {
    const chunks = await new DocxDocumentParser().parse(
      await docx(
        table([
          ['Property', 'Marina Crest Residences'],
          ['Building', 'Tower B'],
          ['Unit ID', 'MC-B-0902'],
          ['Unit Label', 'Apartment 0902'],
        ]),
      ),
    );
    expect(chunks).toHaveLength(8);
    const field = (
      await new StubLeaseModelProvider().extract({
        filename: 'table.docx',
        chunks,
      })
    ).find((f) => f.key === 'unit')!;
    expect(field.value).toBe('MC-B-0902');
    expect(field.sources[0]).toMatchObject({
      filename: 'table.docx',
      chunkId: expect.stringContaining('table-'),
      excerpt: expect.stringContaining('MC-B-0902'),
    });
    expect(field.sources[0].chunkId).toContain('row-');
    expect(field.sources[0].chunkId).toContain('col-');
    expect(field.sources[0].page).toBeUndefined();
    expect(matchLeaseUnit('table.docx', chunks, units).status).toBe('MATCHED');
  });
  it('reads inline table clauses, nested tables and multiple paragraphs in one cell', async () => {
    const body = `<w:tbl><w:tr><w:tc>${paragraph('Unit:')}${paragraph('MC-B-0902')}${table([['Building', 'Tower B']])}</w:tc></w:tr></w:tbl>`;
    const chunks = await new DocxDocumentParser().parse(await docx(body));
    expect(
      chunks.some((c) => c.text === 'Tower B' && c.id.includes('table-2')),
    ).toBe(true);
    expect(
      (
        await new StubLeaseModelProvider().extract({
          filename: 'nested.docx',
          chunks,
        })
      ).find((f) => f.key === 'unit')?.value,
    ).toBe('MC-B-0902');
    const inline = await new DocxDocumentParser().parse(
      await docx(table([['Unit: MC-B-0902 / Apartment 0902']])),
    );
    expect(matchLeaseUnit('inline.docx', inline, units).matchedUnitId).toBe(
      'MC-B-0902',
    );
  });
  it('preserves table rent extraction and derivation when heading case/spacing varies', async () => {
    const chunks = await new DocxDocumentParser().parse(
      await docx(table([[' annual   rent ', 'qar 102,000']])),
    );
    const fields = await new StubLeaseModelProvider().extract({
      filename: 'rent.docx',
      chunks,
    });
    expect(fields.find((f) => f.key === 'annualRent')?.value).toBe('102000');
    expect(fields.find((f) => f.key === 'monthlyRent')?.value).toBe('8500.00');
    expect(fields.find((f) => f.key === 'rentFrequency')?.value).toBe('ANNUAL');
  });
  it('does not consume the next table row as a missing value', async () => {
    const chunks = await new DocxDocumentParser().parse(
      await docx(table([['Unit:'], ['MC-B-0902']])),
    );
    const field = (
      await new StubLeaseModelProvider().extract({
        filename: 'missing.docx',
        chunks,
      })
    ).find((f) => f.key === 'unit')!;
    expect(field.value).toBeNull();
    expect(matchLeaseUnit('missing.docx', chunks, units).matchedUnitId).toBe(
      'MC-B-0902',
    );
  });
  it('matches a unique exact label and uses context to disambiguate duplicates', async () => {
    const duplicate = [
      ...units,
      { ...units[0], id: 'OTHER-A-0902', building: units[1].building },
    ];
    expect(
      matchLeaseUnit('label.txt', await textChunks('Apartment 0902'), units)
        .matchedUnitId,
    ).toBe('MC-B-0902');
    expect(
      matchLeaseUnit('label.txt', await textChunks('Apartment 0902'), duplicate)
        .status,
    ).toBe('AMBIGUOUS');
    expect(
      matchLeaseUnit(
        'label.txt',
        await textChunks('Building: Tower B\nApartment: Apartment 0902'),
        duplicate,
      ).matchedUnitId,
    ).toBe('MC-B-0902');
    expect(
      matchLeaseUnit(
        'label.txt',
        await textChunks('Building: Tower A\nApartment: Apartment 0902'),
        duplicate,
      ).matchedUnitId,
    ).toBe('OTHER-A-0902');
  });
  it('prefers an exact ID over a conflicting label and never guesses unknown/partial IDs', async () => {
    expect(
      matchLeaseUnit(
        'id.txt',
        await textChunks('MC-B-0902 / Apartment 0301'),
        units,
      ).matchedUnitId,
    ).toBe('MC-B-0902');
    for (const text of [
      'Unit: MC-B-9999',
      'Apartment 0903',
      'MC-B-09020',
      'prefixMC-B-0902',
      'MC-B-0902-extra',
    ])
      expect(
        matchLeaseUnit('unknown.txt', await textChunks(text), units).status,
      ).toBe('NOT_FOUND');
  });
  it('requires review for multiple distinct known IDs even when extraction selected one', async () => {
    const match = matchLeaseUnit(
      'ambiguous.txt',
      await textChunks('Unit: MC-B-0902\nPrevious unit reference: MC-A-0301'),
      units,
    );
    expect(match.status).toBe('AMBIGUOUS');
    expect(match.matchedUnitId).toBeNull();
    expect(match.candidateUnitIds).toHaveLength(2);
    expect(match.reason).toContain('More than one unit');
    expect(match.sources).toHaveLength(2);
  });
  it('retains source lines for an exact label split across chunks', async () => {
    const match = matchLeaseUnit(
      'wrapped.txt',
      await textChunks('Apartment\n  0902'),
      units,
    );
    expect(match.matchedUnitId).toBe('MC-B-0902');
    expect(match.sources.map((s) => s.line)).toEqual([1, 2]);
    expect(match.sources.map((s) => s.excerpt)).toEqual([
      'Apartment',
      '  0902',
    ]);
  });
  it('normalizes whitespace and dashes without altering evidence; repeated IDs stay unique', async () => {
    const raw = '  Unit:\u00a0 MC–B–0902\r\n\t MC-B-0902  ';
    expect(normalizeMatchingText(raw)).toBe('unit: mc-b-0902 mc-b-0902');
    const chunks = await textChunks(raw);
    const match = matchLeaseUnit('evidence.txt', chunks, units);
    expect(match.status).toBe('MATCHED');
    expect(match.sources[0].excerpt).toBe(chunks[0].text);
    expect(match.sources[0].excerpt).toContain('MC–B–0902');
  });
  it('retains all PDF pages, actual page locators and original Unicode evidence', async () => {
    const chunks = await new PdfDocumentParser().parse(
      Buffer.from('mocked PDF'),
    );
    const match = matchLeaseUnit('lease.pdf', chunks, units);
    expect(chunks.map((c) => c.locator.page)).toEqual([1, 2]);
    expect(match.sources[0]).toMatchObject({
      filename: 'lease.pdf',
      page: 2,
      excerpt: expect.stringContaining('MC–B–0902'),
    });
  });
  it('rejects empty DOCX content with the existing readable parser error', async () => {
    await expect(
      parseDocument(await docx(paragraph('')), '.docx'),
    ).rejects.toThrow('Could not read this document');
  });
});
