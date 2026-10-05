// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  fieldKeys,
  type Field,
  type Source,
  type Value,
  type ReviewStatus,
} from '@marina/contracts';
import { LeaseExtractedDetails } from '../apps/web/components/lease/fields';
import {
  OwnerAcceptanceStandards,
  NeedsAttention,
} from '../apps/web/components/lease/standards';
import {
  UnitWorkspaceTabs,
  type WorkspaceTab,
} from '../apps/web/components/unit-summary';
const source: Source = {
  id: 'source-18',
  filename: 'lease.docx',
  page: 2,
  paragraph: 18,
  line: 3,
  chunkId: 'paragraph-18',
  excerpt: 'Monthly Rent: QAR 8,500',
  confidence: 0.85,
};
const field: Field = {
  id: 'rent',
  key: 'monthlyRent',
  value: '8500',
  originalValue: '8500',
  currentValue: '8500',
  confidence: 0.85,
  overridden: false,
  reviewStatus: 'PENDING',
  sources: [source],
};
afterEach(cleanup);
describe('compact lease review', () => {
  it('renders all 16 fields in groups with actual counts and no confidence', () => {
    const fields = fieldKeys.map((key) => ({ ...field, id: key, key }));
    render(
      <LeaseExtractedDetails
        fields={fields}
        locked={false}
        onReview={vi.fn()}
      />,
    );
    expect(screen.getByText('0 / 16 accepted')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Rent 5 fields/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    for (const name of ['Parties', 'Lease period', 'Clauses', 'Signatures'])
      fireEvent.click(
        screen.getByRole('button', { name: new RegExp(name + ' ') }),
      );
    expect(document.querySelectorAll('.lease-field-row')).toHaveLength(16);
    expect(document.body.textContent).not.toMatch(/confidence|85%/i);
  });
  it('saves only current value, preserves extraction and disables the selected decision', async () => {
    const mutation = vi.fn();
    function Harness() {
      const [current, setCurrent] = useState(field);
      return (
        <LeaseExtractedDetails
          fields={[current]}
          locked={false}
          onReview={async (f: Field, status: ReviewStatus, value?: Value) => {
            mutation(f, status, value);
            setCurrent({
              ...f,
              reviewStatus: status,
              currentValue: value ?? f.currentValue,
              overridden: value !== undefined,
            });
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(
      screen.getByLabelText('Current value — Monthly rent (QAR)'),
      { target: { value: '8750' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mutation).toHaveBeenCalledWith(field, 'ACCEPTED', '8750'),
    );
    const row = document.querySelector('.lease-field-row')! as HTMLElement;
    expect(within(row).getByText('QAR 8,500.00')).toBeVisible();
    expect(within(row).getByText('QAR 8,750.00')).toBeVisible();
    expect(within(row).getByText('Owner override')).toBeVisible();
    expect(within(row).getByRole('button', { name: 'Accept' })).toBeDisabled();
    fireEvent.click(within(row).getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(
        within(row).getByRole('button', { name: 'Reject' }),
      ).toBeDisabled(),
    );
    expect(field.originalValue).toBe('8500');
  });
  it('cancels without mutation and retains complete source metadata', () => {
    const mutation = vi.fn();
    render(
      <LeaseExtractedDetails
        fields={[field]}
        locked={false}
        onReview={mutation}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(
      screen.getByLabelText('Current value — Monthly rent (QAR)'),
      { target: { value: '9999' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mutation).not.toHaveBeenCalled();
    const trigger = screen.getByRole('button', { name: 'View source' });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(
      trigger.getAttribute('aria-controls')!,
    )!;
    for (const value of [
      'lease.docx',
      'Page 2',
      'Paragraph 18',
      'Line 3',
      'paragraph-18',
      'Source ID: source-18',
      'Monthly Rent: QAR 8,500',
      '1 reference',
    ])
      expect(within(panel).getByText(value)).toBeInTheDocument();
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });
  it('expands the full requirement, reason, values used and source references', () => {
    render(
      <OwnerAcceptanceStandards
        rules={[
          {
            ruleId: 'R1',
            description: "Security deposit must be at least one month's rent.",
            severity: 'HIGH',
            status: 'PASS',
            reason: 'Deposit meets monthly rent.',
            values: { deposit: '8500', monthlyRent: '8500' },
            sources: [source],
          },
        ]}
      />,
    );
    expect(
      screen.getByText("Security deposit must be at least one month's rent."),
    ).toBeVisible();
    const trigger = screen.getByRole('button', { name: 'View details for R1' });
    fireEvent.click(trigger);
    const panel = document.getElementById(
      trigger.getAttribute('aria-controls')!,
    )!;
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    for (const value of [
      'Reason',
      'Deposit meets monthly rent.',
      'Values used',
      'Security deposit (QAR)',
      'Monthly rent (QAR)',
      'Source ID: source-18',
    ])
      expect(within(panel).getByText(value)).toBeInTheDocument();
  });
  it.each(['HIGH', 'MEDIUM', 'LOW'])(
    'keeps %s warning severity, evidence and actions',
    async (severity) => {
      const mutation = vi.fn().mockResolvedValue(undefined);
      const flag = {
        id: 'warning',
        severity,
        message: 'Missing escalation; owner review required.',
        reviewStatus: 'PENDING' as const,
        sources: [source],
      };
      const { container, rerender } = render(
        <NeedsAttention flags={[flag]} locked={false} onReview={mutation} />,
      );
      expect(container.querySelector('.lease-warning')).toHaveClass(
        `warning-${severity.toLowerCase()}`,
      );
      expect(screen.getByText(severity)).toBeVisible();
      fireEvent.click(
        screen.getByRole('button', { name: /View warning source/ }),
      );
      expect(screen.getByText('Source ID: source-18')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Accept warning' }));
      await waitFor(() =>
        expect(mutation).toHaveBeenCalledWith('warning', 'ACCEPTED'),
      );
      rerender(
        <NeedsAttention
          flags={[{ ...flag, reviewStatus: 'ACCEPTED' }]}
          locked={false}
          onReview={mutation}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Accept warning' }),
        ).toBeDisabled(),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reject warning' }));
      await waitFor(() =>
        expect(mutation).toHaveBeenCalledWith('warning', 'REJECTED'),
      );
      rerender(
        <NeedsAttention
          flags={[{ ...flag, reviewStatus: 'REJECTED' }]}
          locked={false}
          onReview={mutation}
        />,
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Reject warning' }),
        ).toBeDisabled(),
      );
    },
  );
  it('supports arrow, Home and End keys with roving tab focus', () => {
    function Harness() {
      const [active, setActive] = useState<WorkspaceTab>('lease');
      return (
        <UnitWorkspaceTabs
          active={active}
          onChange={setActive}
          leaseCount={2}
          issueCount={3}
        />
      );
    }
    render(<Harness />);
    const lease = screen.getByRole('tab', { name: 'Lease records 2' }),
      issues = screen.getByRole('tab', { name: 'Condition & issues 3' });
    fireEvent.keyDown(lease, { key: 'ArrowRight' });
    expect(issues).toHaveFocus();
    expect(issues).toHaveAttribute('aria-selected', 'true');
    expect(lease).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(issues, { key: 'Home' });
    expect(lease).toHaveFocus();
    fireEvent.keyDown(lease, { key: 'End' });
    expect(issues).toHaveFocus();
  });
});
