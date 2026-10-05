'use client';
import { useRef, type KeyboardEvent } from 'react';
import {
  BedDouble,
  Ruler,
  Car,
  Building2,
  FileText,
  Camera,
} from 'lucide-react';
import type { UnitDetail } from '@marina/contracts';
import { Badge } from './review-ui';

export function UnitSummary({ unit }: { unit: UnitDetail }) {
  return (
    <section className="unit-header unit-summary">
      <div className="unit-summary-identity">
        <span className="unit-building-icon">
          <Building2 size={26} aria-hidden />
        </span>
        <div>
          <div className="unit-title">
            <h1>{unit.label}</h1>
            <Badge status={unit.status} />
          </div>
          <p className="external-id">Unit ID: {unit.id}</p>
        </div>
      </div>
      <div className="unit-facts">
        <span>
          <BedDouble size={16} aria-hidden />
          {unit.type}
        </span>
        <span>
          <Ruler size={16} aria-hidden />
          {unit.areaSqm} m²
        </span>
        <span>
          <Car size={16} aria-hidden />
          Parking {unit.parkingBay}
        </span>
      </div>
    </section>
  );
}
export type WorkspaceTab = 'lease' | 'issues';
export function UnitWorkspaceTabs({
  active,
  onChange,
  leaseCount,
  issueCount,
}: {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  leaseCount: number;
  issueCount: number;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabs = [
    {
      key: 'lease' as const,
      label: 'Lease records',
      count: leaseCount,
      Icon: FileText,
    },
    {
      key: 'issues' as const,
      label: 'Condition & issues',
      count: issueCount,
      Icon: Camera,
    },
  ];
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % 2;
    else if (event.key === 'ArrowLeft') next = (index + 1) % 2;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].key);
    refs.current[next]?.focus();
  }
  return (
    <div
      className="workspace-tabs unit-tabs"
      role="tablist"
      aria-label="Unit information"
    >
      {tabs.map(({ key, label, count, Icon }, index) => (
        <button
          key={key}
          ref={(node) => {
            refs.current[index] = node;
          }}
          id={`unit-tab-${key}`}
          role="tab"
          aria-label={`${label} ${count}`}
          aria-selected={active === key}
          aria-controls={`unit-panel-${key}`}
          tabIndex={active === key ? 0 : -1}
          onKeyDown={(event) => keyDown(event, index)}
          onClick={() => onChange(key)}
        >
          <Icon size={18} aria-hidden />
          <span className="unit-tab-label">{label}</span>
          <span className="unit-tab-count">{count}</span>
        </button>
      ))}
    </div>
  );
}
export function UnitWorkspaceSkeleton() {
  return (
    <div className="unit-workspace workspace-skeleton" role="status">
      <span className="sr-only">Loading unit and lease records…</span>
      <div className="unit-summary skeleton-card">
        <span className="skeleton-line short" />
        <span className="skeleton-line title" />
        <span className="skeleton-line short" />
      </div>
      <div className="skeleton-tabs">
        <span className="skeleton-line" />
        <span className="skeleton-line" />
      </div>
      <div className="skeleton-card">
        <span className="skeleton-line title" />
        <span className="skeleton-line" />
      </div>
      <div className="skeleton-card">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="skeleton-line group" />
        ))}
      </div>
      <div className="skeleton-card">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="skeleton-line rule" />
        ))}
      </div>
      <div className="skeleton-card">
        <span className="skeleton-line title" />
        <span className="skeleton-line" />
      </div>
    </div>
  );
}
