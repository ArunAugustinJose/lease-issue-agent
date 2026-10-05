'use client';
import type { ReactNode } from 'react';
import { Camera, FileText, ArrowRight } from 'lucide-react';
import type { IssueView } from '@marina/contracts';
import { ConditionReportCard } from './report';

export function ConditionIssuesTab({
  issues,
  leaseCount,
  onRefresh,
  onLeaseTab,
  upload,
}: {
  issues: IssueView[];
  leaseCount: number;
  onRefresh: () => void;
  onLeaseTab: () => void;
  upload: ReactNode;
}) {
  return (
    <div className="condition-layout">
      <section className="condition-report-list" aria-label="Condition reports">
        {issues.length ? (
          issues.map((issue) => (
            <ConditionReportCard
              key={issue.id}
              issue={issue}
              onChange={onRefresh}
            />
          ))
        ) : (
          <div className="empty-state condition-empty">
            <Camera size={36} aria-hidden />
            <h2>No condition reports yet</h2>
            <p>Upload property photos to create the first condition report.</p>
          </div>
        )}
      </section>
      <aside
        className="condition-upload-panel"
        aria-labelledby="condition-upload-title"
      >
        <span className="eyebrow">Property issue agent</span>
        <h2 id="condition-upload-title">Report a condition</h2>
        {upload}
      </aside>
      <UnitContextCard
        leaseCount={leaseCount}
        issueCount={issues.length}
        onLeaseTab={onLeaseTab}
      />
    </div>
  );
}
export function UnitContextCard({
  leaseCount,
  issueCount,
  onLeaseTab,
}: {
  leaseCount: number;
  issueCount: number;
  onLeaseTab: () => void;
}) {
  return (
    <aside className="condition-context-card" aria-label="Unit context">
      <h3 className="eyebrow">Unit context</h3>
      <p>
        <FileText size={17} aria-hidden />
        {leaseCount} lease record{leaseCount === 1 ? '' : 's'}
      </p>
      <p>
        <Camera size={17} aria-hidden />
        {issueCount} condition report{issueCount === 1 ? '' : 's'}
      </p>
      <button className="text-button" onClick={onLeaseTab}>
        View lease records
        <ArrowRight size={15} aria-hidden />
      </button>
    </aside>
  );
}
