// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { IssueView, UnitDetail } from '@marina/contracts';
import {
  ConditionReportCard,
  ConditionStatus,
} from '../apps/web/components/condition/report';
import { ConditionIssuesTab } from '../apps/web/components/condition/tab';
import { UnitSummary } from '../apps/web/components/unit-summary';
import { LeaseUpload, PhotoUpload } from '../apps/web/components/workspace';
import { api, patch } from '../apps/web/lib/api';
vi.mock('../apps/web/lib/api', () => ({
  api: vi.fn(),
  patch: vi.fn(),
  fileUrl: (path: string) => `http://localhost:4000${path}`,
}));
const issue: IssueView = {
  id: 'report-1',
  unitId: 'MC-B-1204',
  processingStatus: 'COMPLETED',
  provider: 'stub',
  condition: 'DAMAGED',
  summary: 'Water staining beneath the AC.',
  createdAt: '2026-04-12T10:00:00Z',
  photos: [
    { id: 'photo-1', filename: 'ac-leak.png', url: '/api/files/ac.png' },
  ],
  assets: [{ label: 'Wall-mounted AC unit', photoIds: ['photo-1'] }],
  damages: [{ label: 'Water staining on wall', photoIds: ['photo-1'] }],
  workOrder: {
    id: 'draft-1',
    title: 'Inspect AC leak',
    description: 'Inspect the AC and assess wall damage.',
    reviewStatus: 'PENDING',
    photoIds: ['photo-1'],
  },
};
const unit: UnitDetail = {
  id: 'MC-B-1204',
  label: 'Apartment 1204',
  type: '2BR',
  areaSqm: '118',
  parkingBay: 'B-77',
  status: 'AVAILABLE',
  building: 'Tower B',
  property: 'Marina Crest Residences',
  location: 'Doha',
  ownershipEntity: 'Marina Crest',
  leaseCount: 0,
  issueCount: 1,
  leases: [],
  issues: [issue],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:preview');
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('condition workspace redesign', () => {
  it('keeps processing controls disabled and preserves API upload errors for retry', async () => {
    let fail!: (reason: Error) => void;
    vi.mocked(api).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(<PhotoUpload unitId={unit.id} onComplete={vi.fn()} />);
    const input = screen.getByLabelText('Condition photos');
    fireEvent.change(input, {
      target: { files: [new File(['photo'], 'ac.png', { type: 'image/png' })] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create condition report' }),
    );
    expect(
      screen.getByRole('button', { name: 'Assessing photos…' }),
    ).toBeDisabled();
    expect(input).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Preparing photo evidence',
    );
    fail(new Error('Unsupported file type.'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Unsupported file type.',
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Create condition report' }),
    ).toBeEnabled();
    expect(input).toBeEnabled();
  });
  it('keeps the shared summary limited to actual unit facts, without images or upload actions', () => {
    render(<UnitSummary unit={unit} />);
    for (const value of [
      'Apartment 1204',
      'Unit ID: MC-B-1204',
      '2BR',
      '118 m²',
      'Parking B-77',
      'available',
    ])
      expect(screen.getByText(value)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Marina Crest Residences'),
    ).not.toBeInTheDocument();
  });
  it.each(['NEW', 'GOOD', 'WORN', 'OLD', 'DAMAGED', 'UNCERTAIN'])(
    'shows the actual %s condition independently from draft review',
    (status) => {
      const { container } = render(<ConditionStatus status={status} />);
      expect(screen.getByText(status.toLowerCase())).toBeVisible();
      expect(container.firstChild).toHaveClass(
        `condition-${status.toLowerCase()}`,
      );
    },
  );
  it('retains date, assessment, findings, draft details and every photo evidence reference', () => {
    render(<ConditionReportCard issue={issue} onChange={vi.fn()} />);
    for (const value of [
      'Created',
      '12 Apr 2026',
      'Water staining beneath the AC.',
      'Wall-mounted AC unit',
      'Water staining on wall',
      'Inspect AC leak',
      'Inspect the AC and assess wall damage.',
      'Affected unit: MC-B-1204',
      'Evidence: ac-leak.png',
    ])
      expect(screen.getByText(value)).toBeVisible();
    expect(screen.getAllByText('Source: ac-leak.png')).toHaveLength(2);
    expect(screen.getByText('damaged')).toBeVisible();
    expect(screen.getByText('pending')).toBeVisible();
    expect(screen.getByText(/No maintenance job is dispatched/)).toBeVisible();
    expect(
      screen.getByAltText('Reported condition evidence: ac-leak.png'),
    ).toBeVisible();
  });
  it('keeps a failed image accessible with its filename and source link', () => {
    render(<ConditionReportCard issue={issue} onChange={vi.fn()} />);
    fireEvent.error(
      screen.getByAltText('Reported condition evidence: ac-leak.png'),
    );
    expect(
      screen.getByRole('img', { name: 'Photo unavailable: ac-leak.png' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Photo unavailable/ }),
    ).toHaveAttribute('href', 'http://localhost:4000/api/files/ac.png');
  });
  it.each(['ACCEPTED', 'REJECTED'] as const)(
    'keeps the existing %s draft mutation',
    async (status) => {
      const onChange = vi.fn();
      vi.mocked(patch).mockResolvedValue({
        ...issue,
        workOrder: { ...issue.workOrder, reviewStatus: status },
      });
      render(<ConditionReportCard issue={issue} onChange={onChange} />);
      fireEvent.click(
        screen.getByRole('button', {
          name: status === 'ACCEPTED' ? 'Accept draft' : 'Reject draft',
        }),
      );
      expect(patch).toHaveBeenCalledWith('/work-orders/draft-1', { status });
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({
            workOrder: expect.objectContaining({ reviewStatus: status }),
          }),
        ),
      );
    },
  );
  it('shows upload and real context counts immediately, including the empty reports state', () => {
    const switchTab = vi.fn();
    render(
      <ConditionIssuesTab
        issues={[]}
        leaseCount={2}
        onRefresh={vi.fn()}
        onLeaseTab={switchTab}
        upload={<PhotoUpload unitId={unit.id} onComplete={vi.fn()} />}
      />,
    );
    expect(screen.getByLabelText('Condition photos')).toBeVisible();
    expect(screen.getByText('No condition reports yet')).toBeVisible();
    const context = screen.getByRole('complementary', { name: 'Unit context' });
    expect(within(context).getByText('2 lease records')).toBeVisible();
    expect(within(context).getByText('0 condition reports')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'View lease records' }));
    expect(switchTab).toHaveBeenCalledOnce();
  });
  it('retains the eight-photo selection limit and supported formats', () => {
    render(<PhotoUpload unitId={unit.id} onComplete={vi.fn()} />);
    const input = screen.getByLabelText('Condition photos');
    expect(input).toHaveAttribute('accept', '.png,.jpg,.jpeg,.webp,.svg');
    expect(input).toHaveAttribute('multiple');
    fireEvent.change(input, {
      target: {
        files: Array.from(
          { length: 9 },
          (_, i) => new File(['photo'], `${i}.png`, { type: 'image/png' }),
        ),
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose at most 8 photos.',
    );
    expect(
      screen.getByRole('button', { name: 'Create condition report' }),
    ).toBeDisabled();
    expect(api).not.toHaveBeenCalled();
  });
  it('preserves multi-photo previews and submits the existing FormData payload', async () => {
    const onComplete = vi.fn();
    vi.mocked(api).mockResolvedValue(issue);
    render(<PhotoUpload unitId={unit.id} onComplete={onComplete} />);
    const files = [
      new File(['a'], 'ac.png', { type: 'image/png' }),
      new File(['b'], 'wall.png', { type: 'image/png' }),
    ];
    fireEvent.change(screen.getByLabelText('Condition photos'), {
      target: { files },
    });
    expect(screen.getAllByAltText(/Upload preview/)).toHaveLength(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Create condition report' }),
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(issue));
    const [path, options] = vi.mocked(api).mock.calls[0];
    expect(path).toBe('/issues');
    expect(options?.method).toBe('POST');
    const body = options?.body as FormData;
    expect(body.get('unitId')).toBe(unit.id);
    expect(body.getAll('photos')).toHaveLength(2);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2));
  });
  it('makes inline lease upload immediately available and cancellation clears only local selection', () => {
    render(<LeaseUpload inline onComplete={vi.fn()} />);
    const input = screen.getByLabelText('Lease document');
    expect(input).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upload lease' })).toBeDisabled();
    fireEvent.change(input, {
      target: {
        files: [new File(['lease'], 'lease.txt', { type: 'text/plain' })],
      },
    });
    expect(screen.getByText('lease.txt')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(input).toBeVisible();
    expect(screen.queryByText('lease.txt')).not.toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });
});
