import type { Field, RuleResult, Flag } from '@marina/contracts';
export function mayConfirmLease(input: {
  linked: boolean;
  unitAvailable: boolean;
  fields: Pick<Field, 'reviewStatus'>[];
  flags: Pick<Flag, 'reviewStatus'>[];
  rules: Pick<RuleResult, 'status'>[];
}): boolean {
  return (
    !input.linked &&
    input.unitAvailable &&
    input.fields.length === 16 &&
    input.fields.every((f) => f.reviewStatus === 'ACCEPTED') &&
    input.flags.every((f) => f.reviewStatus !== 'PENDING') &&
    input.rules.length === 7 &&
    input.rules.every((r) => r.status === 'PASS')
  );
}
