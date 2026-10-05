'use client';
import { useId, useState, type ComponentType } from 'react';
import {
  Users,
  CalendarDays,
  Coins,
  FileText,
  FileSignature,
  ShieldCheck,
  Check,
  Pencil,
  X,
} from 'lucide-react';
import {
  labels,
  type Field,
  type FieldKey,
  type Value,
  type ReviewStatus,
} from '@marina/contracts';
import { displayValue } from '../review-ui';
import { Chevron, Expansion, ReviewBadge, SourceDetails } from './primitives';

type ReviewField = (
  field: Field,
  status: ReviewStatus,
  value?: Value,
) => Promise<void>;
const groups: {
  name: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  keys: FieldKey[];
}[] = [
  { name: 'Parties', icon: Users, keys: ['landlord', 'tenant', 'unit'] },
  {
    name: 'Lease period',
    icon: CalendarDays,
    keys: ['commencement', 'expiry', 'termMonths'],
  },
  {
    name: 'Rent',
    icon: Coins,
    keys: [
      'rentAmount',
      'rentFrequency',
      'monthlyRent',
      'annualRent',
      'deposit',
    ],
  },
  {
    name: 'Clauses',
    icon: FileText,
    keys: ['escalation', 'renewal', 'termination'],
  },
  {
    name: 'Signatures',
    icon: FileSignature,
    keys: ['landlordSigned', 'tenantSigned'],
  },
];
export function LeaseExtractedDetails({
  fields,
  locked,
  onReview,
}: {
  fields: Field[];
  locked: boolean;
  onReview: ReviewField;
}) {
  return (
    <section className="lease-section" aria-label="Extracted details">
      <div className="lease-section-title">
        <div>
          <h3>
            <ShieldCheck size={19} aria-hidden="true" />
            Extracted details
          </h3>
          <p>
            Review and confirm the information extracted from the lease
            document.
          </p>
        </div>
        <span className="lease-counter">
          {fields.filter((f) => f.reviewStatus === 'ACCEPTED').length} /{' '}
          {fields.length} accepted
        </span>
      </div>
      <div className="lease-groups">
        {groups.map((group) => {
          const values = group.keys.flatMap((key) =>
            fields.filter((f) => f.key === key),
          );
          return values.length ? (
            <LeaseFieldGroup
              key={group.name}
              name={group.name}
              Icon={group.icon}
              fields={values}
              locked={locked}
              onReview={onReview}
            />
          ) : null;
        })}
      </div>
    </section>
  );
}
function LeaseFieldGroup({
  name,
  Icon,
  fields,
  locked,
  onReview,
}: {
  name: string;
  Icon: (typeof groups)[number]['icon'];
  fields: Field[];
  locked: boolean;
  onReview: ReviewField;
}) {
  const [open, setOpen] = useState(name === 'Rent');
  const [editing, setEditing] = useState<string | null>(null);
  const id = useId();
  return (
    <div className="lease-group">
      <h4>
        <button
          className="lease-group-trigger"
          aria-label={`${name} ${fields.length} fields ${fields.filter((field) => field.reviewStatus === 'ACCEPTED').length} / ${fields.length} accepted`}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <Icon size={18} aria-hidden />
          <span>{name}</span>
          <small>{fields.length} fields</small>
          <span className="group-count">
            {fields.filter((f) => f.reviewStatus === 'ACCEPTED').length} /{' '}
            {fields.length} accepted
          </span>
          <Chevron open={open} />
        </button>
      </h4>
      <Expansion id={id} open={open}>
        <table className="lease-table field-table">
          <caption className="sr-only">{name} extracted details</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">AI extraction</th>
              <th scope="col">Current value</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <LeaseFieldRow
                key={field.id}
                field={field}
                locked={locked}
                editing={editing === field.id}
                onEdit={() =>
                  setEditing(editing === field.id ? null : field.id)
                }
                onCloseEdit={() => setEditing(null)}
                onReview={onReview}
              />
            ))}
          </tbody>
        </table>
      </Expansion>
    </div>
  );
}
export function LeaseFieldRow({
  field,
  locked,
  editing,
  onEdit,
  onCloseEdit,
  onReview,
}: {
  field: Field;
  locked: boolean;
  editing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onReview: ReviewField;
}) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sourceId = useId(),
    editId = useId();
  async function review(status: ReviewStatus, value?: Value) {
    setBusy(true);
    setError('');
    try {
      await onReview(field, status, value);
      onCloseEdit();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <tr
        className={`lease-field-row review-${field.reviewStatus.toLowerCase()}`}
      >
        <th scope="row">{labels[field.key]}</th>
        <td data-label="AI extraction">
          {displayValue(field.key, field.originalValue)}
        </td>
        <td
          data-label="Current value"
          className={field.reviewStatus === 'ACCEPTED' ? 'owner-value' : ''}
        >
          {displayValue(field.key, field.currentValue)}
          {field.overridden && (
            <small className="lease-override">Owner override</small>
          )}
        </td>
        <td data-label="Status">
          <ReviewBadge status={field.reviewStatus} />
        </td>
        <td className="lease-actions-cell">
          <div className="lease-row-actions">
            <button
              className="small primary"
              disabled={busy || locked || field.reviewStatus === 'ACCEPTED'}
              onClick={() => review('ACCEPTED')}
            >
              <Check size={13} aria-hidden />
              Accept
            </button>
            <button
              className="small"
              disabled={busy || locked}
              aria-expanded={editing}
              aria-controls={editId}
              onClick={() => {
                setSourceOpen(false);
                setError('');
                onEdit();
              }}
            >
              <Pencil size={13} aria-hidden />
              Edit
            </button>
            <button
              className="small danger"
              disabled={busy || locked || field.reviewStatus === 'REJECTED'}
              onClick={() => review('REJECTED')}
            >
              <X size={13} aria-hidden />
              Reject
            </button>
          </div>
          <button
            className="lease-source-trigger"
            aria-expanded={sourceOpen}
            aria-controls={sourceId}
            onClick={() => {
              if (editing) onCloseEdit();
              setSourceOpen(!sourceOpen);
            }}
          >
            View source
            <Chevron open={sourceOpen} />
          </button>
        </td>
      </tr>
      <tr className="lease-detail-row">
        <td colSpan={5}>
          <Expansion id={editId} open={editing && !locked}>
            <LeaseFieldEditPanel
              key={editing ? 'editing' : 'closed'}
              field={field}
              busy={busy}
              onCancel={onCloseEdit}
              onSave={(value) => review('ACCEPTED', value)}
            />
          </Expansion>
          <Expansion id={sourceId} open={sourceOpen}>
            <SourceDetails sources={field.sources} />
          </Expansion>
          {error && (
            <p className="error" role="alert">
              {error} Your change was not saved.
            </p>
          )}
        </td>
      </tr>
    </>
  );
}
function LeaseFieldEditPanel({
  field,
  busy,
  onSave,
  onCancel,
}: {
  field: Field;
  busy: boolean;
  onSave: (value: Value) => Promise<void>;
  onCancel: () => void;
}) {
  const [input, setInput] = useState(String(field.currentValue ?? ''));
  const id = useId();
  const signature = field.key.endsWith('Signed');
  return (
    <form
      className="lease-edit-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(
          signature
            ? input === 'true'
            : field.key === 'termMonths'
              ? Number(input)
              : input,
        );
      }}
    >
      <h4>
        <Pencil size={16} aria-hidden />
        Edit current value
      </h4>
      <div className="lease-edit-columns">
        <div>
          <small>AI extraction · read-only</small>
          <p>{displayValue(field.key, field.originalValue)}</p>
        </div>
        <div>
          <label htmlFor={id}>Current value — {labels[field.key]}</label>
          {signature ? (
            <select
              id={id}
              required
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
            >
              <option value="">Choose status</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : (
            <textarea
              id={id}
              required
              maxLength={5000}
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
            />
          )}
          <small>
            {['commencement', 'expiry'].includes(field.key)
              ? 'Use YYYY-MM-DD.'
              : field.key === 'rentFrequency'
                ? 'Use MONTHLY, ANNUAL, QUARTERLY, WEEKLY or OTHER.'
                : 'Saving accepts your current value and preserves the AI extraction.'}
          </small>
        </div>
      </div>
      <div className="lease-edit-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" disabled={busy}>
          <Check size={14} aria-hidden />
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
