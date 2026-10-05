'use client';
import { FileText, ShieldCheck } from 'lucide-react';
import type { LeaseView } from '@marina/contracts';
import { patch } from '../../lib/api';
import { ReviewBadge } from './primitives';
import { LeaseExtractedDetails } from './fields';
import { NeedsAttention, OwnerAcceptanceStandards } from './standards';

export function LeaseRecord({
  lease,
  onChange,
  compactTab = false,
}: {
  lease: LeaseView;
  onChange: (lease: LeaseView) => void;
  compactTab?: boolean;
}) {
  return (
    <div className="lease-redesign">
      <LeaseRecordSummary lease={lease} />
      <LeaseExtractedDetails
        separateSource={compactTab}
        fields={lease.fields}
        locked={lease.linked}
        onReview={async (field, status, value) =>
          onChange(
            await patch<LeaseView>(`/leases/${lease.id}/fields/${field.id}`, {
              status,
              ...(value !== undefined ? { value } : {}),
            }),
          )
        }
      />
      <OwnerAcceptanceStandards rules={lease.validations} />
      <NeedsAttention
        flags={lease.flags}
        locked={lease.linked}
        onReview={async (id, status) =>
          onChange(
            await patch<LeaseView>(`/leases/${lease.id}/flags/${id}`, {
              status,
            }),
          )
        }
      />
    </div>
  );
}
function LeaseRecordSummary({ lease }: { lease: LeaseView }) {
  return (
    <section className="lease-record-summary" aria-label="Lease record summary">
      <div className="lease-summary-heading">
        <div className="heading-icon">
          <FileText size={22} aria-hidden />
        </div>
        <div>
          <h2>Lease record</h2>
          <p>{lease.filename}</p>
        </div>
        <ReviewBadge status={lease.linked ? 'ACCEPTED' : 'PENDING'} />
      </div>
      <div className="lease-review-notice">
        <ShieldCheck size={19} aria-hidden />
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
      <small className="lease-provider">{lease.provider}</small>
    </section>
  );
}
