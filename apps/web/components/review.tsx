'use client';
import { useState } from 'react';
import {
  Check,
  X,
  Pencil,
  FileText,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  labels,
  type Field,
  type LeaseView,
  type Source,
  type ReviewStatus,
  type Value,
  type IssueView,
} from '@marina/contracts';
import { fileUrl, patch } from '../lib/api';
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      {status === 'NOT_DETERMINABLE'
        ? 'Could not determine'
        : status.replaceAll('_', ' ').toLowerCase()}
    </span>
  );
}
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
                .join(' · ')}{' '}
              · {Math.round(s.confidence * 100)}% confidence
            </small>
            <p>“{s.excerpt}”</p>
          </blockquote>
        ))
      )}
    </details>
  );
}
export function displayValue(key: Field['key'], value: Value): string {
  if (value === null) return 'Could not determine';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (['rentAmount', 'monthlyRent', 'annualRent', 'deposit'].includes(key))
    return `QAR ${new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))}`;
  if (
    ['commencement', 'expiry'].includes(key) &&
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  )
    return new Date(value + 'T00:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return String(value);
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
      <div className="confidence">
        {Math.round(field.confidence * 100)}% extraction confidence · Agent
        generated
      </div>
      <SourceEvidence sources={field.sources} />
      {!locked && (
        <div className="actions">
          <button
            className="small primary"
            disabled={busy}
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
            disabled={busy}
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
}: {
  lease: LeaseView;
  onChange: (lease: LeaseView) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  async function flagReview(id: string, status: ReviewStatus) {
    setBusy(id);
    setError('');
    try {
      onChange(
        await patch<LeaseView>(`/leases/${lease.id}/flags/${id}`, { status }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="lease-review">
      <div className="section-heading">
        <div className="heading-icon">
          <FileText size={22} />
        </div>
        <div>
          <h2>Lease record</h2>
          <p>{lease.filename}</p>
        </div>
        <Badge status={lease.linked ? 'ACCEPTED' : 'PENDING'} />
      </div>
      <div className="notice">
        <ShieldCheck size={19} />
        <div>
          <strong>
            {lease.linked
              ? 'Owner confirmed · Unit occupied'
              : 'Needs review · Occupancy unchanged'}
          </strong>
          <p>
            {lease.linked
              ? 'All fields were accepted and all rules passed at confirmation. The lease is now locked.'
              : 'Accept every field and review every warning. The unit becomes occupied only when all seven rules pass and the unit is still available.'}
          </p>
        </div>
      </div>
      <div className="meta-row">
        <span>{lease.provider}</span>
        <a href={fileUrl(lease.documentUrl)} target="_blank" rel="noreferrer">
          Download source document ↗
        </a>
      </div>
      <h3>
        Extracted details{' '}
        <span className="count">
          {lease.fields.filter((f) => f.reviewStatus === 'ACCEPTED').length} /{' '}
          {lease.fields.length} accepted
        </span>
      </h3>
      <div className="fields-grid">
        {lease.fields.map((field) => (
          <FieldCard
            key={field.id}
            field={field}
            locked={lease.linked}
            onReview={async (f, status, value) =>
              onChange(
                await patch<LeaseView>(`/leases/${lease.id}/fields/${f.id}`, {
                  status,
                  ...(value !== undefined ? { value } : {}),
                }),
              )
            }
          />
        ))}
      </div>
      <div className="subheading">
        <ShieldCheck size={20} />
        <h3>Owner acceptance standards</h3>
      </div>
      <div className="rule-list">
        {lease.validations.map((rule) => (
          <article className="rule" key={rule.ruleId}>
            <div className="row">
              <strong>
                {rule.ruleId} · {rule.description}
              </strong>
              <Badge status={rule.status} />
            </div>
            <small>{rule.severity} severity</small>
            <p>{rule.reason}</p>
            <details>
              <summary>Values used</summary>
              <dl>
                {Object.entries(rule.values).map(([key, v]) => (
                  <div key={key}>
                    <dt>{labels[key as Field['key']] ?? key}</dt>
                    <dd>{displayValue(key as Field['key'], v ?? null)}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <SourceEvidence sources={rule.sources} />
          </article>
        ))}
      </div>
      <div className="subheading">
        <AlertTriangle size={20} />
        <h3>
          Needs attention <span className="count">{lease.flags.length}</span>
        </h3>
      </div>
      {!lease.flags.length ? (
        <div className="quiet-state">
          No warnings found by the deterministic checks. Extracted values still
          require your review.
        </div>
      ) : (
        lease.flags.map((flag) => (
          <article className="flag" key={flag.id}>
            <div className="row">
              <strong>{flag.message}</strong>
              <Badge status={flag.reviewStatus} />
            </div>
            <small>{flag.severity} severity · Agent warning</small>
            <SourceEvidence sources={flag.sources} />
            <div className="actions">
              <button
                className="small"
                disabled={busy === flag.id || lease.linked}
                onClick={() => flagReview(flag.id, 'ACCEPTED')}
              >
                Accept warning
              </button>
              <button
                className="small danger"
                disabled={busy === flag.id || lease.linked}
                onClick={() => flagReview(flag.id, 'REJECTED')}
              >
                Reject warning
              </button>
            </div>
          </article>
        ))
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export function IssueCard({
  issue,
  onChange,
}: {
  issue: IssueView;
  onChange: (issue: IssueView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function review(status: ReviewStatus) {
    setBusy(true);
    try {
      onChange(
        await patch<IssueView>(`/work-orders/${issue.workOrder.id}`, {
          status,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const evidence = (ids: string[]) =>
    ids
      .map((id) => issue.photos.find((p) => p.id === id)?.filename ?? id)
      .join(', ');
  return (
    <article className="issue-card">
      <div className="row">
        <h3>Condition report</h3>
        <Badge status={issue.condition} />
      </div>
      <div className="photo-grid">
        {issue.photos.map((p) => (
          <a key={p.id} href={fileUrl(p.url)} target="_blank" rel="noreferrer">
            <img
              src={fileUrl(p.url)}
              alt={`Reported condition evidence: ${p.filename}`}
              width={400}
              height={300}
            />
            <small>{p.filename}</small>
          </a>
        ))}
      </div>
      <p className="muted">{issue.summary}</p>
      <div className="finding-grid">
        <div>
          <h4>Visible contents</h4>
          {issue.assets.length ? (
            issue.assets.map((a, i) => (
              <p key={i}>
                {a.label}
                <small className="evidence-name">
                  Source: {evidence(a.photoIds)}
                </small>
              </p>
            ))
          ) : (
            <p className="muted">Could not determine</p>
          )}
        </div>
        <div>
          <h4>Visible issues</h4>
          {issue.damages.length ? (
            issue.damages.map((d, i) => (
              <p key={i}>
                {d.label}
                <small className="evidence-name">
                  Source: {evidence(d.photoIds)}
                </small>
              </p>
            ))
          ) : (
            <p className="muted">No findings determined by stub</p>
          )}
        </div>
      </div>
      <div className="work-order">
        <div className="row">
          <span className="eyebrow">Agent-generated draft work order</span>
          <Badge status={issue.workOrder.reviewStatus} />
        </div>
        <h3>{issue.workOrder.title}</h3>
        <p>{issue.workOrder.description}</p>
        <p className="muted">Affected unit: {issue.unitId}</p>
        <small>Evidence: {evidence(issue.workOrder.photoIds)}</small>
        <div className="actions">
          <button
            className="primary small"
            disabled={busy}
            onClick={() => review('ACCEPTED')}
          >
            <Check size={15} />
            Accept draft
          </button>
          <button
            className="small danger"
            disabled={busy}
            onClick={() => review('REJECTED')}
          >
            <X size={15} />
            Reject draft
          </button>
        </div>
        <small>
          Acceptance records your decision. No maintenance job is dispatched.
        </small>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
