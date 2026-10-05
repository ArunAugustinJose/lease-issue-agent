'use client';
import { useId, useState } from 'react';
import { ShieldCheck, TriangleAlert, Check, X } from 'lucide-react';
import {
  labels,
  type FieldKey,
  type RuleResult,
  type Flag,
  type ReviewStatus,
} from '@marina/contracts';
import { displayValue } from '../review-ui';
import {
  Chevron,
  Expansion,
  ReviewBadge,
  SeverityBadge,
  SourceDetails,
} from './primitives';

export function OwnerAcceptanceStandards({ rules }: { rules: RuleResult[] }) {
  return (
    <section className="lease-section" aria-label="Owner acceptance standards">
      <div className="lease-section-title">
        <div>
          <h3>
            <ShieldCheck size={19} aria-hidden />
            Owner acceptance standards
          </h3>
          <p>Rules applied to validate the lease against owner requirements.</p>
        </div>
        <span className="lease-counter">
          {rules.filter((r) => r.status === 'PASS').length} / {rules.length}{' '}
          pass
        </span>
      </div>
      <div className="lease-table-shell">
        <table className="lease-table standards-table">
          <caption className="sr-only">Owner lease validation rules</caption>
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">Requirement</th>
              <th scope="col">Status</th>
              <th scope="col">Severity</th>
              <th scope="col">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <RuleRow key={rule.ruleId} rule={rule} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function RuleRow({ rule }: { rule: RuleResult }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <tr>
        <th scope="row">{rule.ruleId}</th>
        <td className="rule-requirement">{rule.description}</td>
        <td data-label="Status">
          <ReviewBadge status={rule.status} />
        </td>
        <td data-label="Severity">
          <SeverityBadge severity={rule.severity} />
        </td>
        <td className="lease-toggle-cell">
          <button
            className="lease-details-trigger"
            aria-label={`${open ? 'Hide' : 'View'} details for ${rule.ruleId}`}
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen(!open)}
          >
            <span className="mobile-details-label">View details</span>
            <Chevron open={open} />
          </button>
        </td>
      </tr>
      <tr className="lease-detail-row">
        <td colSpan={5}>
          <Expansion id={id} open={open}>
            <div className="lease-rule-details">
              <h4>Reason</h4>
              <p>{rule.reason}</p>
              <h4>Values used</h4>
              <dl className="lease-values">
                {Object.entries(rule.values).map(([key, value]) => (
                  <div key={key}>
                    <dt>{labels[key as FieldKey] ?? key}</dt>
                    <dd>{displayValue(key as FieldKey, value ?? null)}</dd>
                  </div>
                ))}
              </dl>
              <SourceDetails sources={rule.sources} />
            </div>
          </Expansion>
        </td>
      </tr>
    </>
  );
}
export function NeedsAttention({
  flags,
  locked,
  onReview,
}: {
  flags: Flag[];
  locked: boolean;
  onReview: (id: string, status: ReviewStatus) => Promise<void>;
}) {
  return (
    <section className="lease-section" aria-label="Needs attention">
      <div className="lease-section-title">
        <div>
          <h3>
            <TriangleAlert size={19} aria-hidden />
            Needs attention
            <span className="lease-count-badge">{flags.length}</span>
          </h3>
          <p>Items that require owner review.</p>
        </div>
      </div>
      {flags.length ? (
        <div className="lease-warnings">
          {flags.map((flag) => (
            <WarningRow
              key={flag.id}
              flag={flag}
              locked={locked}
              onReview={onReview}
            />
          ))}
        </div>
      ) : (
        <div className="quiet-state">
          <Check size={16} aria-hidden />
          No warnings found by the deterministic checks. Extracted values still
          require your review.
        </div>
      )}
    </section>
  );
}
function WarningRow({
  flag,
  locked,
  onReview,
}: {
  flag: Flag;
  locked: boolean;
  onReview: (id: string, status: ReviewStatus) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const id = useId();
  async function review(status: ReviewStatus) {
    setBusy(true);
    setError('');
    try {
      await onReview(flag.id, status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={`lease-warning warning-${flag.severity.toLowerCase()}`}>
      <div className="lease-warning-row">
        <SeverityBadge severity={flag.severity} />
        <div className="lease-warning-message">
          <strong>{flag.message}</strong>
          <small>Agent warning</small>
        </div>
        <ReviewBadge status={flag.reviewStatus} />
        <div className="lease-row-actions">
          <button
            className="small"
            disabled={busy || locked || flag.reviewStatus === 'ACCEPTED'}
            onClick={() => review('ACCEPTED')}
          >
            <Check size={13} aria-hidden />
            Accept warning
          </button>
          <button
            className="small danger"
            disabled={busy || locked || flag.reviewStatus === 'REJECTED'}
            onClick={() => review('REJECTED')}
          >
            <X size={13} aria-hidden />
            Reject warning
          </button>
        </div>
        <button
          className="lease-details-trigger"
          aria-label={`${open ? 'Hide' : 'View'} warning source: ${flag.message}`}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <span className="mobile-details-label">Source</span>
          <Chevron open={open} />
        </button>
      </div>
      <Expansion id={id} open={open}>
        <SourceDetails sources={flag.sources} />
      </Expansion>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
