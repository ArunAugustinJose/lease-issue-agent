import type { Field, Value } from '@marina/contracts';
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      {status === 'NOT_DETERMINABLE'
        ? 'Could not determine'
        : status.replaceAll('_', ' ').toLowerCase()}
    </span>
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
