'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Camera,
  FileText,
  Upload,
  MapPin,
  Car,
  Ruler,
  BedDouble,
  ChevronRight,
} from 'lucide-react';
import type {
  UnitView,
  UnitDetail,
  LeaseView,
  IssueView,
} from '@marina/contracts';
import { api } from '../lib/api';
import { ConditionIssuesTab } from './condition/tab';
import './condition/styles.css';
import './lease/tab.css';
import './landing/styles.css';
import { Badge, LeaseReview } from './review';
import {
  UnitSummary,
  UnitWorkspaceTabs,
  UnitWorkspaceSkeleton,
} from './unit-summary';
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="error">
      {message}
    </p>
  ) : null;
}
function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading property records…
    </div>
  );
}
export function LeaseUpload({
  onComplete,
  inline = false,
}: {
  onComplete: (lease: LeaseView) => void;
  inline?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="upload-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setError('');
        const body = new FormData();
        body.append('file', file);
        try {
          onComplete(await api<LeaseView>('/leases', { method: 'POST', body }));
          setFile(null);
          if (inputRef.current) inputRef.current.value = '';
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="file-label">
        <Upload size={22} aria-hidden />
        {!inline && <strong>Upload a lease document</strong>}
        <span>PDF, DOCX or TXT · Maximum 10 MB</span>
        <input
          aria-label="Lease document"
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && <p className="selected-file">{file.name}</p>}
      <button className="primary" disabled={!file || busy}>
        {busy
          ? 'Processing document…'
          : inline
            ? 'Upload lease'
            : 'Extract & review lease'}
        <ArrowUpRight size={16} aria-hidden />
      </button>
      {busy && (
        <p role="status">
          {inline && <span className="spinner" aria-hidden />}Reading source
          text and checking owner rules…
        </p>
      )}
      {inline && file && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setFile(null);
            setError('');
            if (inputRef.current) inputRef.current.value = '';
          }}
        >
          Cancel
        </button>
      )}
      <ErrorMessage message={error} />
    </form>
  );
}
export function Overview() {
  const router = useRouter();
  const [units, setUnits] = useState<UnitView[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api<UnitView[]>('/units')
      .then(setUnits)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (error)
    return (
      <section className="panel">
        <h1>Property records unavailable</h1>
        <ErrorMessage message={error} />
        <button onClick={load}>Try again</button>
      </section>
    );
  if (!units) return <Loading />;
  return (
    <div className="landing-page">
      <div className="landing-art landing-art-top" aria-hidden="true">
        <Image
          src="/images/landing/marina-top-bg.png"
          alt=""
          fill
          sizes="(max-width: 1456px) 100vw, 1456px"
          preload
        />
      </div>
      <div className="landing-art landing-art-bottom" aria-hidden="true">
        <Image
          src="/images/landing/marina-bottom-waves.png"
          alt=""
          fill
          sizes="(max-width: 1456px) 100vw, 1456px"
        />
      </div>
      <div className="page-heading landing-hero">
        <div>
          <span className="eyebrow">Marina Crest Holdings W.L.L.</span>
          <h1>Your property, connected.</h1>
          <p>
            Review lease records and reported conditions in one unit workspace.
          </p>
        </div>
      </div>
      <div className="property-heading">
        <h2>Marina Crest Residences</h2>
        <p>
          <MapPin size={15} aria-hidden />
          Lusail Marina District, Doha
        </p>
      </div>
      <div className="overview-layout">
        <section
          className="landing-towers"
          aria-label="Property towers and units"
        >
          {[...new Set(units.map((u) => u.building))].map((building) => (
            <section className="building-group" key={building}>
              <div className="row landing-tower-heading">
                <h3>
                  <Building2 size={18} aria-hidden />
                  {building}
                </h3>
                <span className="muted">
                  {units.filter((u) => u.building === building).length} units
                </span>
              </div>
              <div className="unit-grid">
                {units
                  .filter((u) => u.building === building)
                  .map((u) => (
                    <Link
                      className="unit-card"
                      key={u.id}
                      href={`/units/${u.id}`}
                    >
                      <div className="row">
                        <span className="unit-symbol">
                          <Building2 size={20} aria-hidden />
                        </span>
                        <Badge status={u.status} />
                      </div>
                      <h3>{u.label}</h3>
                      <p className="external-id">{u.id}</p>
                      <div className="unit-facts">
                        <span>
                          <BedDouble size={14} aria-hidden />
                          {u.type}
                        </span>
                        <span>
                          <Ruler size={14} aria-hidden />
                          {u.areaSqm} m²
                        </span>
                        <span>
                          <Car size={14} aria-hidden />
                          {u.parkingBay}
                        </span>
                      </div>
                      <div className="unit-bottom">
                        <span>
                          <FileText size={14} aria-hidden />
                          {u.leaseCount} lease{' '}
                          {u.leaseCount === 1 ? 'record' : 'records'} ·{' '}
                          {u.issueCount}{' '}
                          {u.issueCount === 1 ? 'issue' : 'issues'}
                        </span>
                        <ChevronRight size={18} aria-hidden />
                      </div>
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </section>
        <aside className="panel upload-aside">
          <span className="eyebrow">Lease record agent</span>
          <h2>From document to decision.</h2>
          <p className="muted">
            Extract lease details, inspect their sources and check the owner’s
            acceptance standards.
          </p>
          <LeaseUpload
            onComplete={(lease) => router.push(`/leases/${lease.id}`)}
          />
        </aside>
      </div>
    </div>
  );
}
export function PhotoUpload({
  unitId,
  onComplete,
}: {
  unitId: string;
  onComplete: (issue: IssueView) => void;
}) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ url: string; filename: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const urls = files.map((f) => ({
      url: URL.createObjectURL(f),
      filename: f.name,
    }));
    setPreviews(urls);
    return () => urls.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [files]);
  return (
    <form
      className="upload-form condition-upload-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const body = new FormData();
        body.append('unitId', unitId);
        files.forEach((f) => body.append('photos', f));
        try {
          onComplete(await api<IssueView>('/issues', { method: 'POST', body }));
          setFiles([]);
          if (photoInputRef.current) photoInputRef.current.value = '';
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="unit-confirm">
        Affected unit
        <input value={unitId} readOnly />
      </label>
      <label className="file-label">
        <Camera size={26} aria-hidden />
        <strong>Add condition photos</strong>
        <span>PNG, JPEG, WebP or safe SVG</span>
        <span>Up to 8 photos, 10 MB each</span>
        <input
          aria-label="Condition photos"
          ref={photoInputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.svg"
          disabled={busy}
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            if (selected.length > 8) {
              setError('Choose at most 8 photos.');
              setFiles([]);
            } else {
              setError('');
              setFiles(selected);
            }
          }}
        />
      </label>
      {previews.length > 0 && (
        <div className="preview-grid">
          {previews.map(({ url, filename }) => (
            <figure key={url}>
              <img
                src={url}
                alt={`Upload preview: ${filename}`}
                width={160}
                height={120}
              />
              <figcaption>{filename}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <button className="primary" disabled={!files.length || busy}>
        {busy ? 'Assessing photos…' : 'Create condition report'}
        <ArrowUpRight size={16} aria-hidden />
      </button>
      {busy && (
        <p role="status">
          <span className="spinner" aria-hidden />
          Preparing photo evidence and a draft for your review…
        </p>
      )}
      <ErrorMessage message={error} />
    </form>
  );
}
export function UnitWorkspace({ id }: { id: string }) {
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState<'lease' | 'issues'>('lease');
  const [uploaded, setUploaded] = useState<LeaseView | null>(null);

  const load = useCallback(async () => {
    try {
      setUnit(await api<UnitDetail>(`/units/${encodeURIComponent(id)}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  function updateLease(lease: LeaseView) {
    setUploaded(lease);
    void load();
  }
  if (error)
    return (
      <section className="panel">
        <Link href="/">← All units</Link>
        <ErrorMessage message={error} />
        <button onClick={load}>Try again</button>
      </section>
    );
  if (!unit) return <UnitWorkspaceSkeleton />;
  const leases =
    uploaded && !unit.leases.some((l) => l.id === uploaded.id)
      ? [uploaded, ...unit.leases]
      : unit.leases;
  return (
    <div className="unit-workspace">
      <Link className="back" href="/">
        <ArrowLeft size={16} aria-hidden />
        All units
      </Link>
      <UnitSummary unit={unit} />
      <UnitWorkspaceTabs
        active={active}
        onChange={setActive}
        leaseCount={leases.length}
        issueCount={unit.issues.length}
      />
      <div
        id="unit-panel-lease"
        className="lease-records-tab"
        role="tabpanel"
        aria-labelledby="unit-tab-lease"
        hidden={active !== 'lease'}
        tabIndex={0}
      >
        <section
          className="lease-upload-panel lease-inline-upload"
          id="unit-lease-upload"
          aria-labelledby="upload-panel-title"
        >
          <h2 id="upload-panel-title">
            <Upload size={20} aria-hidden />
            Upload lease document
          </h2>
          <p>
            Upload a lease to extract details and validate it against owner
            standards.
          </p>
          <LeaseUpload inline onComplete={updateLease} />
        </section>
        {leases.length ? (
          leases.map((lease) => (
            <div className="unit-lease-record" key={lease.id}>
              {lease.candidateUnitId !== unit.id &&
                lease.unitId !== unit.id && (
                  <div className="notice">
                    <p>
                      This document does not identify this unit. Review the
                      extracted unit before linking.
                    </p>
                  </div>
                )}
              <LeaseReview lease={lease} onChange={updateLease} compactTab />
            </div>
          ))
        ) : (
          <div className="empty-state">
            <FileText size={36} aria-hidden />
            <h2>No lease record yet</h2>
            <p>
              Upload a lease document to extract and validate its details for
              this unit.
            </p>
            <p className="muted">
              Choose a document in the upload area above to get started.
            </p>
          </div>
        )}
      </div>
      <div
        id="unit-panel-issues"
        role="tabpanel"
        aria-labelledby="unit-tab-issues"
        hidden={active !== 'issues'}
        tabIndex={0}
      >
        <ConditionIssuesTab
          issues={unit.issues}
          leaseCount={leases.length}
          onRefresh={() => {
            void load();
          }}
          onLeaseTab={() => setActive('lease')}
          upload={
            <PhotoUpload
              unitId={unit.id}
              onComplete={() => {
                void load();
              }}
            />
          }
        />
      </div>
    </div>
  );
}
export function LeaseWorkspace({ id }: { id: string }) {
  const [lease, setLease] = useState<LeaseView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<LeaseView>(`/leases/${encodeURIComponent(id)}`)
      .then(setLease)
      .catch((e) => setError(e.message));
  }, [id]);
  if (error) return <ErrorMessage message={error} />;
  if (!lease) return <Loading />;
  const unit = lease.unitId ?? lease.candidateUnitId;
  return (
    <>
      <Link className="back" href={unit ? `/units/${unit}` : '/'}>
        <ArrowLeft size={16} />
        {unit ? 'Open unit workspace' : 'All units'}
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Lease record agent</span>
          <h1>Review the details. Confirm with confidence.</h1>
          <p>
            {unit
              ? `Matched unit: ${unit}`
              : 'No unit matched. Correct and accept the leased unit to establish a link.'}
          </p>
        </div>
      </div>
      <div className="panel">
        <LeaseReview lease={lease} onChange={setLease} />
      </div>
    </>
  );
}
