import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  BatchSettings,
  EntitledPreset,
  JobRecord,
  MappingRow,
  PresetPrompt,
  ProductImageRole,
  ProductScanSummary,
  ProviderStatus,
  ValidationReport,
} from '../shared/types.js';
import './style.css';
import { elapsedSince, formatIstTimestamp } from '../shared/timestamp.js';

const defaults: BatchSettings = {
  model: 'gpt-image-2',
  outputs: 1,
  concurrency: 1,
  retryLimit: 0,
  overwrite: false,
  allImagesAsReferences: false,
};
const roles: ProductImageRole[] = [
  'FRONT',
  'BACK',
  'DETAIL',
  'LABEL_BRANDING',
  'FABRIC',
  'MEASUREMENT',
  'APPROVED_PROMPT_01',
  'UNASSIGNED',
  'IGNORE',
];

function App() {
  const [inputRoot, setInputRoot] = useState('');
  const [outputRoot, setOutputRoot] = useState('');
  const [preset, setPreset] = useState<EntitledPreset>();
  const [selected, setSelected] = useState([1]);
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [summaries, setSummaries] = useState<ProductScanSummary[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [status, setStatus] = useState<ProviderStatus>();
  const [settings, setSettings] = useState(defaults);
  const [validation, setValidation] = useState<ValidationReport>();
  const [cliReadiness, setCliReadiness] = useState<ValidationReport['cliReadiness']>();
  const [message, setMessage] = useState('Select folders, choose outputs, then scan products.');
  const [validating, setValidating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string>();
  const [confirmedRunId, setConfirmedRunId] = useState<string>();
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const submitLock = useRef(false);
  const previewRequests = useRef(new Set<string>());
  const validRows = rows.filter((row) => row.enabled && row.status === 'valid');
  const terminalStatuses = ['completed', 'failed', 'cancelled', 'skipped', 'interrupted'];
  const resumableStatuses = ['submitted', 'queued', 'processing', 'downloading'];
  const activeRunId = jobs.find(
    (job) =>
      job.runId &&
      ((confirmedRunId === job.runId && !terminalStatuses.includes(job.status)) ||
        (Boolean(job.generationId) && resumableStatuses.includes(job.status))),
  )?.runId;
  const currentJobs = activeRunId ? jobs.filter((job) => job.runId === activeRunId) : [];
  const active = currentJobs.length > 0;
  const latestRunJobs = currentRunId ? jobs.filter((job) => job.runId === currentRunId) : [];
  const runLabel = active
    ? 'RUNNING NOW'
    : latestRunJobs.some((job) => job.status === 'failed')
      ? 'FAILED'
      : latestRunJobs.some((job) => job.status === 'completed')
        ? 'COMPLETED'
        : 'NO ACTIVE RUN';
  const canGenerate = Boolean(validation?.ok && validation.fingerprint && !active && !submitting);
  useEffect(() => {
    void Promise.all([
      window.openartApp.preset(),
      window.openartApp.getInputRoot(),
      window.openartApp.getOutputRoot(),
      window.openartApp.jobs(),
    ])
      .then(([loaded, input, output, persisted]) => {
        setPreset(loaded);
        setInputRoot(input ?? '');
        setOutputRoot(output ?? '');
        setJobs(persisted);
        const latestJob = persisted.find(
          (job) => Boolean(job.generationId) && resumableStatuses.includes(job.status),
        );
        if (latestJob?.runId) setCurrentRunId(latestJob.runId);
      })
      .catch((e) => setMessage(e instanceof Error ? e.message : 'Startup failed.'));
    const off = window.openartApp.onJobs(setJobs);
    const timer = window.setInterval(() => void window.openartApp.jobs().then(setJobs), 1500);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const files = [
      ...(preset?.prompts ?? [])
        .filter((prompt) => selected.includes(prompt.number))
        .flatMap((p) => (p.referencePath ? [{ path: p.referencePath, name: p.name }] : [])),
      ...summaries.flatMap((s) => s.images),
      ...currentJobs.flatMap((j) => [{ path: j.finalOutputPath ?? j.outputPath, name: j.product }]),
    ];
    let cancelled = false;
    void (async () => {
      for (const file of files) {
        if (previewRequests.current.has(file.path)) continue;
        previewRequests.current.add(file.path);
        const result = await window.openartApp.preview(file.path);
        if (!cancelled && result.ok && result.dataUrl)
          setPreviews((old) => ({ ...old, [file.path]: result.dataUrl! }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preset, selected, summaries, currentJobs]);
  const invalidate = () => setValidation(undefined);
  const choose = async (kind: 'input' | 'output') => {
    const folder = await window.openartApp.pickFolder();
    if (!folder) return;
    try {
      const value =
        kind === 'input'
          ? await window.openartApp.setInputRoot(folder)
          : await window.openartApp.setOutputRoot(folder);
      if (kind === 'input') setInputRoot(value);
      else setOutputRoot(value);
      invalidate();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Folder unavailable.');
    }
  };
  const togglePrompt = (prompt: PresetPrompt) => {
    if (!prompt.ready) return;
    setSelected((old) =>
      old.includes(prompt.number)
        ? old.filter((n) => n !== prompt.number)
        : [...old, prompt.number].sort((a, b) => a - b),
    );
    setRows([]);
    setSummaries([]);
    invalidate();
  };
  const scan = async () => {
    if (!inputRoot || !selected.length) {
      setMessage('Select a product folder and at least one output.');
      return;
    }
    try {
      const result = await window.openartApp.scanProducts({
        root: inputRoot,
        promptNumbers: selected,
      });
      setRows(result.rows);
      setSummaries(result.summaries);
      invalidate();
      setMessage(
        `Scanned ${result.summaries.length} product folders and ${result.rows.length} jobs.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Scan failed.');
    }
  };
  const overrideRole = async (product: string, sourcePath: string, role: ProductImageRole) => {
    const changed = await Promise.all(
      rows
        .filter((r) => r.product === product)
        .map((row) => window.openartApp.overrideProductRole({ row, sourcePath, role })),
    );
    setRows((old) => old.map((row) => changed.find((r) => r.id === row.id) ?? row));
    invalidate();
  };
  const toggleProduct = (product: string, include: boolean) => {
    setRows((old) =>
      old.map((row) =>
        row.product === product && row.status === 'valid' ? { ...row, enabled: include } : row,
      ),
    );
    setSummaries((old) => old.map((s) => (s.product === product ? { ...s, enabled: include } : s)));
    invalidate();
  };
  const validate = async () => {
    if (!inputRoot || !outputRoot || !validRows.length) {
      setMessage('Scan products and select a valid product before validating.');
      return;
    }
    setValidating(true);
    setValidation(undefined);
    try {
      const result = await window.openartApp.validateBatch({
        rows: validRows,
        inputRoot,
        outputRoot,
        settings,
      });
      setValidation(result);
      setCliReadiness(result.cliReadiness);
      setMessage(
        result.ok && result.cliReadiness?.ready
          ? `Batch validated locally. Validated at: ${formatIstTimestamp(new Date().toISOString())}`
          : result.cliReadiness?.error ?? result.errors.join(' '),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Validation failed.');
    } finally {
      setValidating(false);
    }
  };
  const openConfirm = () => {
    if (!canGenerate) {
      setMessage('Validate Batch successfully before generating.');
      return;
    }
    setConfirming(true);
  };
  const confirm = async () => {
    if (submitLock.current || !validation?.fingerprint) return;
    submitLock.current = true;
    setConfirming(false);
    setSubmitting(true);
    setMessage('Preparing uploads…');
    const runId = crypto.randomUUID();
    setCurrentRunId(runId);
    setConfirmedRunId(runId);
    try {
      const result = await window.openartApp.start({
        requestId: runId,
        expectedFingerprint: validation.fingerprint,
        rows: validRows,
        inputRoot,
        outputRoot,
        settings,
      });
      setJobs((old) => [...result.jobs, ...old.filter((job) => job.runId !== result.runId)]);
      setMessage('Current run started.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Generation failed before submission.');
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  };
  return (
    <div className="app">
      <header>
        <div>
          <span className="eyebrow">ENTITLED / LOCAL STUDIO</span>
          <h1>
            Images <span>×</span> OpenArt
          </h1>
          <p>Simple product catalogue batch processing</p>
        </div>
        <div className={`connection ${status?.connected ? 'online' : ''}`}>
          <i />
          {status?.connected ? 'OpenArt Connected' : 'OpenArt Not Connected'}
          <small>
            {status?.version
              ? `CLI ${status.version} · ${status.plan ?? 'account ready'}`
              : status?.message}
          </small>
        </div>
      </header>
      <section className="panel">
        <Title n="01" text="Folders" />
        <div className="folder-grid">
          <Folder
            label="Product input root"
            value={inputRoot}
            onPick={() => void choose('input')}
          />
          <Folder label="Results root" value={outputRoot} onPick={() => void choose('output')} />
        </div>
      </section>
      <section className="panel">
        <Title n="02" text="Outputs" />
        <p className="muted">ENTITLED Catalogue v1 · Prompt 01 is selected by default.</p>
        <div className="prompt-grid">
          {preset?.prompts.map((prompt) => (
            <PromptCard
              key={prompt.number}
              prompt={prompt}
              selected={selected.includes(prompt.number)}
              thumbnail={prompt.referencePath ? previews[prompt.referencePath] : undefined}
              onToggle={() => togglePrompt(prompt)}
            />
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <Title n="03" text="Products" />
          <button className="primary" type="button" onClick={() => void scan()}>
            Scan Products
          </button>
        </div>
        {summaries.length === 0 ? (
          <p className="muted">Scan your product input root to review role-aware mappings.</p>
        ) : (
          summaries.map((summary) => (
            <ProductReview
              key={summary.product}
              summary={summary}
              rows={rows.filter((r) => r.product === summary.product)}
              previews={previews}
              onRole={overrideRole}
              onToggle={toggleProduct}
            />
          ))
        )}
      </section>
      <section className="panel">
        <div className="panel-title"><Title n="04" text="Generate" /><strong className="run-state">{runLabel}</strong></div>
        <div className="generate-summary">
          <span>Products: {new Set(validRows.map((r) => r.product)).size}</span>
          <span>Jobs: {validRows.length}</span>
          <span>Model: GPT Image 2</span>
          <label>
            Concurrency{' '}
            <input
              type="number"
              min="1"
              max="5"
              value={settings.concurrency}
              onChange={(e) => {
                setSettings({ ...settings, concurrency: Number(e.target.value) });
                invalidate();
              }}
            />
          </label>
          <label>
            Retry limit{' '}
            <input
              type="number"
              min="0"
              max="10"
              value={settings.retryLimit}
              onChange={(e) => {
                setSettings({ ...settings, retryLimit: Number(e.target.value) });
                invalidate();
              }}
            />
          </label>
        </div>
        <div className="actions">
          <button
            type="button"
            onClick={() => void validate()}
            disabled={validating || !validRows.length}
          >
            {validating ? 'Validating…' : 'Validate Batch'}
          </button>
          <button className="primary" type="button" disabled={!canGenerate} onClick={openConfirm}>
            Generate Selected
          </button>
          {cliReadiness && !cliReadiness.ready && (
            <button type="button" onClick={() => void window.openartApp.selectOpenArtCli()}>
              Select OpenArt CLI
            </button>
          )}
        </div>
        {validation && (
          <div className={validation.ok ? 'success-panel' : 'error-panel'}>
            <strong>{validation.ok ? 'Batch validation passed' : 'Batch validation failed'}</strong>
            {cliReadiness?.ready && <div>OpenArt CLI ready · {cliReadiness.version} · {cliReadiness.path}</div>}
            {validation.errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
            {validation.ok && (
              <small>
                {validation.jobs} jobs · prompt and input hashes verified · no upload performed
                <br />
                Validated at: {formatIstTimestamp(validation.validatedAt)}
              </small>
            )}
          </div>
        )}
        <p className="status-message">{message}</p>
      </section>
      <CurrentRun jobs={currentJobs} previews={previews} runId={activeRunId} />
      <History jobs={jobs.filter((j) => j.runId !== activeRunId)} />
      {confirming && (
        <div className="modal-backdrop">
          <div className="confirmation-modal">
            <h2>Generate selected images?</h2>
            <p>Products: {new Set(validRows.map((r) => r.product)).size}</p>
            <p>Jobs: {validRows.length}</p>
            <p>Model: GPT Image 2</p>
            <p>Results folder: {outputRoot}</p>
            <p>OpenArt credits will be used; exact cost is unavailable.</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => void confirm()}
                disabled={submitting}
              >
                Generate Images
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function Title({ n, text }: { n: string; text: string }) {
  return (
    <div className="panel-title">
      <div>
        <span className="step">{n}</span>
        <h2>{text}</h2>
      </div>
    </div>
  );
}
function Folder({ label, value, onPick }: { label: string; value: string; onPick: () => void }) {
  return (
    <div className="folder">
      <label>{label}</label>
      <div>
        <input readOnly value={value} />
        <button type="button" onClick={onPick}>
          Change
        </button>
      </div>
    </div>
  );
}
function PromptCard({
  prompt,
  selected,
  thumbnail,
  onToggle,
}: {
  prompt: PresetPrompt;
  selected: boolean;
  thumbnail?: string;
  onToggle: () => void;
}) {
  return (
    <label
      className={`prompt-card ${selected ? 'selected' : ''} ${!prompt.ready ? 'disabled' : ''}`}
    >
      <input type="checkbox" checked={selected} disabled={!prompt.ready} onChange={onToggle} />
      <span>
        <b>
          {String(prompt.number).padStart(2, '0')} — {prompt.name}
        </b>
        <small>
          {thumbnail ? (
            <img src={thumbnail} alt="presentation reference" />
          ) : prompt.reference ? (
            'No presentation reference configured'
          ) : (
            'Bundled prompt'
          )}
        </small>
        <em>{prompt.ready ? 'Ready' : prompt.missingReason}</em>
      </span>
    </label>
  );
}
function ProductReview({
  summary,
  rows,
  previews,
  onRole,
  onToggle,
}: {
  summary: ProductScanSummary;
  rows: MappingRow[];
  previews: Record<string, string>;
  onRole: (p: string, path: string, role: ProductImageRole) => void;
  onToggle: (p: string, on: boolean) => void;
}) {
  return (
    <article className="product-review">
      <div className="product-heading">
        <h3>{summary.product}</h3>
        <label>
          <input
            type="checkbox"
            checked={summary.enabled && !summary.errors.length}
            disabled={Boolean(summary.errors.length)}
            onChange={(e) => onToggle(summary.product, e.target.checked)}
          />{' '}
          Include
        </label>
      </div>
      <div className="source-thumbnails">
        {summary.images.map((image) => (
          <div className="source-card" key={image.path}>
            {previews[image.path] ? (
              <img src={previews[image.path]} alt={image.name} />
            ) : (
              <span>Preview unavailable</span>
            )}
            <b>{image.name}</b>
            <small>{image.role}</small>
            <select
              value={image.role}
              onChange={(e) =>
                onRole(summary.product, image.path, e.target.value as ProductImageRole)
              }
            >
              {roles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {rows.map((row) => (
        <div className="mapping-row" key={row.id}>
          <strong>Prompt {row.promptKey}</strong>
          <span>
            Included:{' '}
            {row.orderedInputs.map((i) => `${i.order}. ${i.image.name} — ${i.label}`).join(' · ') ||
              'none'}
          </span>
          <span>
            Excluded:{' '}
            {(row.excludedProductInputs ?? [])
              .map((i) => `${i.name} — ${i.role} — Not required for Prompt ${row.promptKey}`)
              .join(' · ') || 'none'}
          </span>
          <em className={row.errors.length ? 'error' : 'ok'}>
            {row.errors.length ? row.errors.join(' ') : 'Valid'}
          </em>
        </div>
      ))}
    </article>
  );
}
function CurrentRun({
  jobs,
  previews,
  runId,
}: {
  jobs: JobRecord[];
  previews: Record<string, string>;
  runId?: string;
}) {
  return (
    <section className="panel current-run" data-testid="current-run">
      <div className="panel-title">
        <h2>RUNNING NOW</h2>
        {jobs.length > 0 && <span className="spinner" />}
      </div>
      {jobs.length === 0 ? (
        <p className="muted">NO ACTIVE RUN</p>
      ) : (
        jobs.map((job) => (
          <div className="current-job" key={job.id}>
            <div>
              <b>
                {job.product} / {job.promptKey}
              </b>
              <strong>{friendlyStatus(job.status)}</strong>
              <small>Run ID: {runId?.slice(0, 8)}</small>
              <small>
                {job.generationId
                  ? `Creation ID: ${job.generationId}`
                  : 'Preparing provider submission…'}
              </small>
              <small>Started: {formatIstTimestamp(job.startedAt ?? job.createdAt)}</small>
              <small>Last updated: {formatIstTimestamp(job.lastStatusAt)}</small>
              <small>Elapsed: {elapsedSince(job.startedAt ?? job.createdAt)}</small>
              <small>Output: {job.outputPath}</small>
              <small>
                {job.failureStage
                  ? `${job.failureStage}: ${job.providerErrorMessage ?? job.error ?? ''}`
                  : ''}
              </small>
            </div>
            {previews[job.finalOutputPath ?? job.outputPath] && (
              <img
                className="job-preview"
                src={previews[job.finalOutputPath ?? job.outputPath]}
                alt="generated result"
              />
            )}
          </div>
        ))
      )}
    </section>
  );
}
function History({ jobs }: { jobs: JobRecord[] }) {
  return (
    <details className="panel">
      <summary>PREVIOUS RUNS · historical</summary>
      {[...jobs]
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .map((job) => (
        <div className="history-row" key={job.id}>
          <b>
            {job.product} / {job.promptKey}
          </b>
          <span>{friendlyStatus(job.status)}</span>
          <small>
            {formatIstTimestamp(job.endedAt ?? job.lastStatusAt ?? job.createdAt)} · {job.providerErrorMessage ?? job.error ?? ''}
          </small>
        </div>
      ))}
    </details>
  );
}
function friendlyStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
createRoot(document.getElementById('root')!).render(<App />);
