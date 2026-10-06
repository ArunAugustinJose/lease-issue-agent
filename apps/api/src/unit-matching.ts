import type { Source } from '@marina/contracts';
import type { Chunk } from './parsers';

export function normalizeMatchingText(text: string): string {
  return text
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}
function contains(text: string, value: string): boolean {
  return occurrences(text, value).length > 0;
}
function occurrences(
  text: string,
  value: string,
): { start: number; end: number }[] {
  const escaped = normalizeMatchingText(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
  if (!escaped) return [];
  return [
    ...text.matchAll(
      new RegExp(`(?<![\\p{L}\\p{N}-])${escaped}(?![\\p{L}\\p{N}-])`, 'gu'),
    ),
  ].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}
export interface KnownUnit {
  id: string;
  label: string;
  building: { name: string; property: { name: string } };
}
export interface UnitMatch {
  status: 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND';
  matchedUnitId: string | null;
  candidateUnitIds: string[];
  reason: string;
  sources: Source[];
}
export function matchLeaseUnit(
  filename: string,
  chunks: Chunk[],
  units: KnownUnit[],
): UnitMatch {
  let offset = 0;
  const located = chunks.map((chunk) => {
    const normalized = normalizeMatchingText(chunk.text);
    const start = offset;
    offset += normalized.length + 1;
    return { chunk, normalized, start, end: start + normalized.length };
  });
  const text = located.map((c) => c.normalized).join(' ');
  const exact = units.filter((u) => contains(text, u.id));
  let candidates = exact;
  let evidenceValues = exact.map((u) => u.id);
  if (!exact.length) {
    candidates = units.filter((u) => contains(text, u.label));
    const buildings = [...new Set(units.map((u) => u.building.name))].filter(
      (name) => contains(text, name),
    );
    const properties = [
      ...new Set(units.map((u) => u.building.property.name)),
    ].filter((name) => contains(text, name));
    if (buildings.length)
      candidates = candidates.filter((u) =>
        buildings.includes(u.building.name),
      );
    if (properties.length)
      candidates = candidates.filter((u) =>
        properties.includes(u.building.property.name),
      );
    evidenceValues = [
      ...new Set(candidates.map((u) => u.label)),
      ...buildings,
      ...properties,
    ];
  }
  const ranges = evidenceValues.flatMap((v) => occurrences(text, v));
  const sources = located
    .filter((c) =>
      ranges.some((range) => c.start < range.end && c.end > range.start),
    )
    .map((c) => c.chunk)
    .map((c) => ({
      filename,
      chunkId: c.id,
      ...c.locator,
      excerpt: c.text.slice(0, 600),
      confidence: 1,
    }));
  return {
    status:
      candidates.length === 1
        ? 'MATCHED'
        : candidates.length
          ? 'AMBIGUOUS'
          : 'NOT_FOUND',
    matchedUnitId: candidates.length === 1 ? candidates[0].id : null,
    candidateUnitIds: candidates.map((u) => u.id),
    reason:
      candidates.length === 1
        ? exact.length
          ? 'One exact known unit ID occurs in the document.'
          : 'The exact unit label and available property/building context resolve uniquely.'
        : candidates.length
          ? 'More than one unit could match this document. Review the extracted unit before linking.'
          : 'This document does not identify a known unit. Review the extracted unit before linking.',
    sources,
  };
}
