'use client';
import { useState } from 'react';
import {
  Camera,
  CalendarDays,
  ClipboardList,
  TriangleAlert,
  FileText,
  Paperclip,
  Check,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import type {
  IssueView,
  PhotoView,
  Finding,
  ReviewStatus,
} from '@marina/contracts';
import { fileUrl, patch } from '../../lib/api';
import { ReviewBadge } from '../lease/primitives';

export function ConditionStatus({ status }: { status: string }) {
  return (
    <span className={`condition-status condition-${status.toLowerCase()}`}>
      <span className="condition-status-dot" aria-hidden />
      {status.replaceAll('_', ' ').toLowerCase()}
    </span>
  );
}
export function ConditionReportCard({
  issue,
  onChange,
}: {
  issue: IssueView;
  onChange: (issue: IssueView) => void;
}) {
  const created = new Date(issue.createdAt);
  const evidence = (ids: string[]) =>
    ids
      .map(
        (id) => issue.photos.find((photo) => photo.id === id)?.filename ?? id,
      )
      .join(', ');
  return (
    <article className="issue-card condition-report-card">
      <header className="condition-report-header">
        <div>
          <h3>
            <Camera size={19} aria-hidden />
            Condition report
          </h3>
          {!Number.isNaN(created.getTime()) && (
            <p className="condition-created">
              <CalendarDays size={13} aria-hidden />
              Created{' '}
              <time dateTime={issue.createdAt}>
                {created.toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </time>
            </p>
          )}
        </div>
        <ConditionStatus status={issue.condition} />
      </header>
      <div className="condition-report-body">
        <ConditionPhotoGallery photos={issue.photos} />
        <div className="condition-report-details">
          <p className="condition-assessment">{issue.summary}</p>
          <div className="condition-findings">
            <FindingList
              title="Visible contents"
              findings={issue.assets}
              evidence={evidence}
              empty="Could not determine"
            />
            <FindingList
              title="Visible issues"
              findings={issue.damages}
              evidence={evidence}
              empty="No findings determined by stub"
              warning
            />
          </div>
          <DraftWorkOrderCard
            issue={issue}
            evidence={evidence(issue.workOrder.photoIds)}
            onChange={onChange}
          />
        </div>
      </div>
    </article>
  );
}
export function ConditionPhotoGallery({ photos }: { photos: PhotoView[] }) {
  return (
    <div
      className={`photo-grid condition-photo-gallery ${photos.length === 1 ? 'single-photo' : ''}`}
      aria-label="Condition photo evidence"
    >
      {photos.map((photo) => (
        <PhotoEvidence key={photo.id} photo={photo} />
      ))}
    </div>
  );
}
function PhotoEvidence({ photo }: { photo: PhotoView }) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      className="condition-photo"
      href={fileUrl(photo.url)}
      target="_blank"
      rel="noreferrer"
    >
      {failed ? (
        <div
          className="condition-photo-fallback"
          role="img"
          aria-label={`Photo unavailable: ${photo.filename}`}
        >
          <ImageIcon size={24} aria-hidden />
          <span>Photo unavailable</span>
        </div>
      ) : (
        <img
          src={fileUrl(photo.url)}
          alt={`Reported condition evidence: ${photo.filename}`}
          width={400}
          height={300}
          onError={() => setFailed(true)}
        />
      )}
      <small>{photo.filename}</small>
    </a>
  );
}
function FindingList({
  title,
  findings,
  evidence,
  empty,
  warning = false,
}: {
  title: string;
  findings: Finding[];
  evidence: (ids: string[]) => string;
  empty: string;
  warning?: boolean;
}) {
  const Icon = warning ? TriangleAlert : ClipboardList;
  return (
    <section
      className={
        warning ? 'condition-visible-issues' : 'condition-visible-contents'
      }
    >
      <h4>
        <Icon size={16} aria-hidden />
        {title}
      </h4>
      {findings.length ? (
        <ul>
          {findings.map((finding, i) => (
            <li key={i}>
              {finding.label}
              <small className="evidence-name">
                Source: {evidence(finding.photoIds)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{empty}</p>
      )}
    </section>
  );
}
function DraftWorkOrderCard({
  issue,
  evidence,
  onChange,
}: {
  issue: IssueView;
  evidence: string;
  onChange: (issue: IssueView) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
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
  return (
    <section className="work-order condition-draft">
      <div className="condition-draft-heading">
        <span className="eyebrow">
          <FileText size={16} aria-hidden />
          Agent-generated draft work order
        </span>
        <ReviewBadge status={issue.workOrder.reviewStatus} />
      </div>
      <h3>{issue.workOrder.title}</h3>
      <p>{issue.workOrder.description}</p>
      <p className="condition-draft-unit">Affected unit: {issue.unitId}</p>
      <p className="condition-draft-evidence">
        <Paperclip size={13} aria-hidden />
        <span>Evidence: {evidence}</span>
      </p>
      <div className="actions">
        <button
          className="primary small"
          disabled={busy}
          onClick={() => review('ACCEPTED')}
        >
          <Check size={15} aria-hidden />
          Accept draft
        </button>
        <button
          className="small danger"
          disabled={busy}
          onClick={() => review('REJECTED')}
        >
          <X size={15} aria-hidden />
          Reject draft
        </button>
      </div>
      <small className="condition-draft-note">
        Acceptance records your decision. No maintenance job is dispatched.
      </small>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
