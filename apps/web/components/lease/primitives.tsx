'use client';
import { type ReactNode } from 'react';
import { Check, X, Clock3, FileText, ChevronDown } from 'lucide-react';
import type { Source } from '@marina/contracts';

export function ReviewBadge({ status }: { status: string }) {
  const Icon = ['ACCEPTED', 'PASS'].includes(status)
    ? Check
    : ['REJECTED', 'FAIL'].includes(status)
      ? X
      : Clock3;
  return (
    <span className={`badge lease-status ${status.toLowerCase()}`}>
      <Icon size={12} aria-hidden="true" />
      {status === 'NOT_DETERMINABLE'
        ? 'Could not determine'
        : status === 'PASS' || status === 'FAIL'
          ? status
          : status.toLowerCase()}
    </span>
  );
}
export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`severity severity-${severity.toLowerCase()}`}>
      {severity}
    </span>
  );
}
export function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      size={17}
      className={`lease-chevron ${open ? 'is-open' : ''}`}
      aria-hidden="true"
    />
  );
}
export function Expansion({
  open,
  id,
  children,
}: {
  open: boolean;
  id: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      className={`lease-expansion ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="lease-expansion-inner">{children}</div>
    </div>
  );
}
export function SourceDetails({ sources }: { sources: Source[] }) {
  return (
    <section className="lease-source-details" aria-label="Source evidence">
      <h4>
        <FileText size={16} aria-hidden="true" />
        {sources.length ? 'Source' : 'Source unavailable'}
        <span>
          {sources.length} reference{sources.length === 1 ? '' : 's'}
        </span>
      </h4>
      {!sources.length ? (
        <p>No source was determined. Owner verification is required.</p>
      ) : (
        sources.map((source, i) => (
          <div className="lease-reference" key={source.id ?? i}>
            <small>Reference {i + 1}</small>
            <strong>{source.filename}</strong>
            <div className="lease-locators">
              {source.page != null && <span>Page {source.page}</span>}
              {source.paragraph != null && (
                <span>Paragraph {source.paragraph}</span>
              )}
              {source.line != null && <span>Line {source.line}</span>}
              {source.chunkId && <span>{source.chunkId}</span>}
              {source.id && <span>Source ID: {source.id}</span>}
            </div>
            <p className="lease-excerpt">
              <span>Source excerpt</span>
              <q>{source.excerpt}</q>
            </p>
          </div>
        ))
      )}
    </section>
  );
}
