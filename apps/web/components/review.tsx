'use client';
import { useState } from 'react';
import { Check, X, Pencil, FileText } from 'lucide-react';
import {
  labels,
  type Field,
  type LeaseView,
  type Source,
  type ReviewStatus,
  type Value,
  type IssueView,
} from '@marina/contracts';
import { ConditionReportCard } from './condition/report';
import { Badge, displayValue } from './review-ui';
export { Badge, displayValue } from './review-ui';
import { LeaseRecord } from './lease/record';
export function SourceEvidence({ sources }: { sources: Source[] }) {
  return (
    <details className="source">
      <summary>
        <FileText size={14} /> Source ·{' '}
        {sources.length
          ? `${sources.length} reference${sources.length > 1 ? 's' : ''}`
          : 'unavailable'}
      </summary>
      {!sources.length ? (
        <p>No source was determined. Owner verification is required.</p>
      ) : (
        sources.map((s, i) => (
          <blockquote key={s.id ?? i}>
            <strong>{s.filename}</strong>
            <small>
              {[
                s.page && `Page ${s.page}`,
                s.paragraph && `Paragraph ${s.paragraph}`,
                s.line && `Line ${s.line}`,
                s.chunkId,
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
            <p>“{s.excerpt}”</p>
          </blockquote>
        ))
      )}
    </details>
  );
}
export function FieldCard({
  field,
  locked,
  onReview,
}: {
  field: Field;
  locked: boolean;
  onReview: (
    field: Field,
    status: ReviewStatus,
    override?: Value,
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(field.currentValue ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function review(status: ReviewStatus, override?: Value) {
    setBusy(true);
    setError('');
    try {
      await onReview(field, status, override);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const boolean = field.key.endsWith('Signed');
  return (
    <article
      className={`field-card ${field.reviewStatus === 'ACCEPTED' ? 'confirmed' : ''}`}
    >
      <div className="row">
        <h4>{labels[field.key]}</h4>
        <Badge status={field.reviewStatus} />
      </div>
      <div className="value-grid">
        <div>
          <small>AI extraction</small>
          <p>{displayValue(field.key, field.originalValue)}</p>
        </div>
        <div>
          <small>{field.overridden ? 'Owner override' : 'Current value'}</small>
          <p className={field.reviewStatus === 'ACCEPTED' ? 'owner-value' : ''}>
            {displayValue(field.key, field.currentValue)}
          </p>
        </div>
      </div>
      <SourceEvidence sources={field.sources} />
      {!locked && (
        <div className="actions">
          <button
            className="small primary"
            disabled={busy || field.reviewStatus === 'ACCEPTED'}
            onClick={() => review('ACCEPTED')}
          >
            <Check size={14} />
            Accept
          </button>
          <button
            className="small"
            disabled={busy}
            onClick={() => {
              setInput(String(field.currentValue ?? ''));
              setEditing(!editing);
            }}
          >
            <Pencil size={14} />
            Edit
          </button>
          <button
            className="small danger"
            disabled={busy || field.reviewStatus === 'REJECTED'}
            onClick={() => review('REJECTED')}
          >
            <X size={14} />
            Reject
          </button>
        </div>
      )}
      {editing && (
        <form
          className="edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            const corrected = boolean
              ? input === 'true'
              : field.key === 'termMonths'
                ? Number(input)
                : input;
            void review('ACCEPTED', corrected);
          }}
        >
          <label htmlFor={`edit-${field.id}`}>
            Correct {labels[field.key]}
          </label>
          {boolean ? (
            <select
              id={`edit-${field.id}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              required
            >
              <option value="">Choose status</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : (
            <textarea
              id={`edit-${field.id}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              required
              maxLength={5000}
            />
          )}
          <small>
            {['commencement', 'expiry'].includes(field.key)
              ? 'Use YYYY-MM-DD.'
              : field.key === 'rentFrequency'
                ? 'Use MONTHLY, ANNUAL, QUARTERLY, WEEKLY or OTHER.'
                : 'Your correction preserves the original agent value.'}
          </small>
          <div className="actions">
            <button className="small primary" disabled={busy}>
              Save & accept
            </button>
            <button
              type="button"
              className="small"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
export function LeaseReview({
  lease,
  onChange,
  compactTab = false,
}: {
  lease: LeaseView;
  onChange: (lease: LeaseView) => void;
  compactTab?: boolean;
}) {
  return (
    <LeaseRecord lease={lease} onChange={onChange} compactTab={compactTab} />
  );
}
export function IssueCard({
  issue,
  onChange,
}: {
  issue: IssueView;
  onChange: (issue: IssueView) => void;
}) {
  return <ConditionReportCard issue={issue} onChange={onChange} />;
}
