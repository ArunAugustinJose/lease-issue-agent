export const fieldKeys = [
  'landlord',
  'tenant',
  'unit',
  'commencement',
  'expiry',
  'termMonths',
  'rentAmount',
  'rentFrequency',
  'monthlyRent',
  'annualRent',
  'deposit',
  'escalation',
  'renewal',
  'termination',
  'landlordSigned',
  'tenantSigned',
] as const;
export type FieldKey = (typeof fieldKeys)[number];
export type ReviewStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type RuleStatus = 'PASS' | 'FAIL' | 'NOT_DETERMINABLE';
export type ProcessingStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type Value = string | number | boolean | null;
export interface Source {
  id?: string;
  filename: string;
  chunkId: string;
  page?: number | null;
  paragraph?: number | null;
  line?: number | null;
  excerpt: string;
  confidence: number;
}
export interface Extraction {
  key: FieldKey;
  value: Value;
  sources: Source[];
  confidence: number;
}
export interface Field extends Extraction {
  id: string;
  originalValue: Value;
  currentValue: Value;
  reviewStatus: ReviewStatus;
  overridden: boolean;
}
export interface Flag {
  id: string;
  severity: string;
  message: string;
  sources: Source[];
  reviewStatus: ReviewStatus;
}
export interface RuleResult {
  id?: string;
  ruleId: string;
  description: string;
  severity: string;
  status: RuleStatus;
  reason: string;
  values: Partial<Record<FieldKey, Value>>;
  sources: Source[];
}
export interface LeaseView {
  id: string;
  unitId: string | null;
  candidateUnitId: string | null;
  linked: boolean;
  processingStatus: ProcessingStatus;
  provider: string;
  filename: string;
  documentUrl: string;
  fields: Field[];
  flags: Flag[];
  validations: RuleResult[];
  createdAt: string;
}
export interface PhotoView {
  id: string;
  filename: string;
  url: string;
}
export interface Finding {
  label: string;
  photoIds: string[];
}
export interface IssueView {
  id: string;
  unitId: string;
  processingStatus: ProcessingStatus;
  provider: string;
  photos: PhotoView[];
  condition: string;
  summary: string;
  assets: Finding[];
  damages: Finding[];
  workOrder: {
    id: string;
    title: string;
    description: string;
    reviewStatus: ReviewStatus;
    photoIds: string[];
  };
  createdAt: string;
}
export interface UnitView {
  id: string;
  label: string;
  type: string;
  areaSqm: string;
  parkingBay: string;
  status: 'AVAILABLE' | 'OCCUPIED';
  building: string;
  property: string;
  location: string;
  ownershipEntity: string;
  leaseCount: number;
  issueCount: number;
}
export interface UnitDetail extends UnitView {
  leases: LeaseView[];
  issues: IssueView[];
}
export const labels: Record<FieldKey, string> = {
  landlord: 'Landlord',
  tenant: 'Tenant',
  unit: 'Leased unit',
  commencement: 'Commencement date',
  expiry: 'Expiry date',
  termMonths: 'Lease term (months)',
  rentAmount: 'Stated rent (QAR)',
  rentFrequency: 'Rent frequency',
  monthlyRent: 'Monthly rent (QAR)',
  annualRent: 'Annual rent (QAR)',
  deposit: 'Security deposit (QAR)',
  escalation: 'Rent escalation',
  renewal: 'Renewal terms',
  termination: 'Termination terms',
  landlordSigned: 'Landlord signed',
  tenantSigned: 'Tenant signed',
};
