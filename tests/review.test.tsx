// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  Badge,
  FieldCard,
  SourceEvidence,
  IssueCard,
} from '../apps/web/components/review';
import type { Field, IssueView } from '@marina/contracts';
afterEach(cleanup);
describe('owner review UI', () => {
  it.each(['PASS', 'FAIL', 'NOT_DETERMINABLE'])(
    'shows %s with status text',
    (status) => {
      render(<Badge status={status} />);
      expect(
        screen.getByText(
          status === 'NOT_DETERMINABLE'
            ? 'Could not determine'
            : status.toLowerCase(),
        ),
      ).toBeVisible();
    },
  );
  it('retains original extraction alongside the approved override', () => {
    const f: Field = {
      id: '1',
      key: 'monthlyRent',
      value: '8750',
      originalValue: '8500',
      currentValue: '8750',
      confidence: 0.85,
      overridden: true,
      reviewStatus: 'ACCEPTED',
      sources: [],
    };
    render(<FieldCard field={f} locked={false} onReview={vi.fn()} />);
    expect(screen.getByText('QAR 8,500.00')).toBeVisible();
    expect(screen.getByText('QAR 8,750.00')).toBeVisible();
    expect(screen.getByText('Owner override')).toBeVisible();
  });
  it('makes missing evidence clear', () => {
    render(<SourceEvidence sources={[]} />);
    fireEvent.click(screen.getByText(/Source/));
    expect(screen.getByText(/No source was determined/)).toBeInTheDocument();
  });
  it('provides independent draft acceptance and rejection controls', () => {
    const issue: IssueView = {
      id: 'i',
      unitId: 'MC-B-1204',
      processingStatus: 'COMPLETED',
      provider: 'stub',
      photos: [],
      condition: 'UNCERTAIN',
      summary: 'Unknown',
      assets: [],
      damages: [],
      createdAt: '2026-01-01',
      workOrder: {
        id: 'w',
        title: 'Review condition',
        description: 'Inspect first',
        reviewStatus: 'PENDING',
        photoIds: [],
      },
    };
    render(<IssueCard issue={issue} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Accept draft' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reject draft' })).toBeVisible();
    expect(screen.getByText(/No maintenance job is dispatched/)).toBeVisible();
  });
});
