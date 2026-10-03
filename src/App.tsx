import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
//import JSZip from 'jszip';
import { useFfmpeg } from './hooks/useFfmpeg';
import {
  ACCEPTED_EXTENSIONS,
  BITRATE_OPTIONS,
  MAX_FILE_SIZE_BYTES,
  type ConversionJob,
} from './types/types';
import './App.css';
import {
  isAcceptedFile,
  isWithinSizeLimit,
  formatBytes,
  mpThreeNameFor,
  makeId,
} from './utils/utils';
import { useDailyQuota } from './hooks/useDailyQuota';
import { trackEvent } from './utils/tracking';

export default function App({ account }: { account?: ReactNode }) {
  const { load, convert, loadState, loadError } = useFfmpeg();
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [bitrate, setBitrate] =
    useState<(typeof BITRATE_OPTIONS)[number]>('192k');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter(isAcceptedFile);
    if (incoming.length === 0) return;
    setJobs((prev) => [
      ...prev,
      ...incoming.map<ConversionJob>((file) => {
        const tooLarge = !isWithinSizeLimit(file);
        return {
          id: makeId(),
          file,
          status: tooLarge ? 'error' : 'queued',
          progress: 0,
          error: tooLarge
            ? `Exceeds ${formatBytes(MAX_FILE_SIZE_BYTES)} size limit (file is ${formatBytes(file.size)})`
            : undefined,
          invalid: tooLarge,
        };
      }),
    ]);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  //const removeJob = (id: string) =>
  //  setJobs((prev) => prev.filter((j) => j.id !== id));

  const removeJob = (id: string) => {
    setJobs((prev) => {
      const job = prev.find((j) => j.id === id);
      // Blob itself doesn't need explicit revocation (no object URL held long-term),
      // but dropping the reference lets GC reclaim the underlying buffer immediately
      // rather than waiting for the whole jobs array to be replaced later.
      if (job?.outputBlob) job.outputBlob = undefined;
      return prev.filter((j) => j.id !== id);
    });
  };

  const clearQueue = () =>
    setJobs((prev) => prev.filter((j) => j.status === 'converting'));

  const statusText = useMemo(() => {
    if (loadState === 'loading') return 'Status: Warming up the engine…';
    if (loadState === 'error') return `Status: Engine failed — ${loadError}`;
    if (isConverting) return 'Status: Converting file…';
    if (jobs.length === 0) return 'Status: Standby';
    if (jobs.every((j) => j.status === 'done'))
      return 'Status: All conversions complete';
    return 'Status: Standby';
  }, [loadState, loadError, isConverting, jobs]);

  const statusTone =
    loadState === 'error' ? 'error' : isConverting ? 'busy' : 'idle';
  const quota = useDailyQuota();

  const convertAll = async () => {
    if (loadState !== 'ready' || isConverting) return;

    const queued = jobs.filter(
      (j) => (j.status === 'queued' || j.status === 'error') && !j.invalid,
    );

    if (queued.length === 0) return;
    setIsConverting(true);

    for (const job of queued) {
      if (quota.remainingNow() <= 0) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? {
                  ...j,
                  status: 'error',
                  error: `Daily limit reached (${quota.limit}/day) — try again tomorrow`,
                }
              : j,
          ),
        );
        continue;
      }
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, status: 'converting', progress: 0, error: undefined }
            : j,
        ),
      );
      try {
        const blob = await convert(job.file, bitrate, (ratio) => {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === job.id ? { ...j, progress: Math.round(ratio * 100) } : j,
            ),
          );
        });
        quota.consume();
        void trackEvent('conversion', { bitrate, inputBytes: job.file.size });
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? {
                  ...j,
                  status: 'done',
                  progress: 100,
                  outputBlob: blob,
                  outputName: mpThreeNameFor(job.file.name),
                  outputSizeBytes: blob.size,
                }
              : j,
          ),
        );
      } catch (err) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? {
                  ...j,
                  status: 'error',
                  error:
                    err instanceof Error ? err.message : 'Conversion failed',
                }
              : j,
          ),
        );
      }
    }
    setIsConverting(false);
  };

  const downloadJob = (job: ConversionJob) => {
    if (!job.outputBlob || !job.outputName) return;
    const url = URL.createObjectURL(job.outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = job.outputName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllZip = async () => {
    const done = jobs.filter(
      (j) => j.status === 'done' && j.outputBlob && j.outputName,
    );
    if (done.length === 0) return;
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    done.forEach((j) => zip.file(j.outputName!, j.outputBlob!));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted-audio.zip';
    a.click();
    URL.revokeObjectURL(url);
  };
  /*
  const downloadAllZip = async () => {
    const done = jobs.filter(
      (j) => j.status === 'done' && j.outputBlob && j.outputName,
    );
    if (done.length === 0) return;
    const zip = new JSZip();
    done.forEach((j) => zip.file(j.outputName!, j.outputBlob!));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted-audio.zip';
    a.click();
    URL.revokeObjectURL(url);
  };
*/

  const doneCount = jobs.filter((j) => j.status === 'done').length;
  const hasQueued = jobs.some(
    (j) => j.status === 'queued' || j.status === 'error',
  );

  const eligibleForConversion = jobs.filter(
    (j) => (j.status === 'queued' || j.status === 'error') && !j.invalid,
  );

  const blockedByQuotaIds = new Set(
    eligibleForConversion.slice(quota.remaining).map((j) => j.id),
  );

  const failedCount = jobs.filter(
    (j) => j.status === 'error' && !j.invalid,
  ).length;

  const retryFailed = () =>
    setJobs((prev) =>
      prev.map((j) =>
        j.status === 'error' && !j.invalid
          ? { ...j, status: 'queued', progress: 0, error: undefined }
          : j,
      ),
    );

  const clearCompleted = () =>
    setJobs((prev) => prev.filter((j) => j.status !== 'done'));
  return (
    <div className="rack">
      <div className="grain" aria-hidden="true" />

      {account}
      <header className="brand">
        <div className="brand__mark">
          <span className="dial" />
          <span className="dial" />
        </div>
        <div className="brand__text">
          <h1>SIGNAL</h1>
          <p>
            MP4 <span className="arrow">&#8594;</span> MP3 CONVERTER &mdash;
            RUNS LOCALLY IN YOUR BROWSER
          </p>
        </div>
        <div
          className={`led led--${loadState === 'ready' ? 'on' : loadState === 'error' ? 'error' : 'pending'}`}
        >
          <span className="led__dot" />
          {loadState === 'ready'
            ? 'ENGINE READY'
            : loadState === 'error'
              ? 'ENGINE ERROR'
              : 'LOADING ENGINE'}
        </div>
      </header>

      <main className="panel">
        <section
          className={`dropzone ${isDragOver ? 'dropzone--active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
        >
          <div className="dropzone__inner">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 3v12m0 0-4-4m4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p>Drag video files here, or</p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse Files
            </button>
            <span className="dropzone__hint">
              MP4 · MPEG · FLV · F4V · MOV · MKV · AVI · WEBM
            </span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.join(',')}
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        </section>

        <section className="controls">
          <div className="control-group">
            <label className="control-label">Bitrate</label>
            <div className="segmented">
              {BITRATE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`segmented__opt ${bitrate === opt ? 'segmented__opt--active' : ''}`}
                  onClick={() => setBitrate(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <button
            data-testid="limit-message"
            type="button"
            className="btn btn--convert"
            disabled={
              !hasQueued ||
              loadState !== 'ready' ||
              isConverting ||
              quota.remaining <= 0
            }
            onClick={convertAll}
          >
            {isConverting
              ? 'Converting…'
              : quota.remaining <= 0
                ? 'Daily limit reached'
                : 'Convert to MP3'}
          </button>
          <span className="quota-badge" aria-live="polite">
            {quota.used}/{quota.limit} today
          </span>
        </section>

        {jobs.length > 0 && (
          <section className="queue">
            <div className="queue__header">
              <span>Queue ({jobs.length})</span>
              <div className="queue__actions">
                {failedCount > 0 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={retryFailed}
                  >
                    Retry Failed ({failedCount})
                  </button>
                )}
                {doneCount > 0 && (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={downloadAllZip}
                    >
                      Download All (.zip)
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={clearCompleted}
                    >
                      Clear Completed
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={clearQueue}
                  disabled={isConverting}
                >
                  Clear
                </button>
              </div>
            </div>

            <ul className="queue__list">
              {jobs.map((job) => {
                const isBlockedByQuota = blockedByQuotaIds.has(job.id);
                return (
                  <li
                    key={job.id}
                    className={`track track--${job.status} ${isBlockedByQuota ? 'track--blocked' : ''}`}
                  >
                    <div className="track__info">
                      <span className="track__name">{job.file.name}</span>
                      <span className="track__meta">
                        {formatBytes(job.file.size)}
                        {job.status === 'done' && job.outputSizeBytes
                          ? ` → ${formatBytes(job.outputSizeBytes)}`
                          : ''}
                        {job.status === 'error' && job.error
                          ? ` — ${job.error}`
                          : ''}
                        {isBlockedByQuota
                          ? " — won't convert (daily limit reached)"
                          : ''}
                      </span>
                    </div>
                    <div
                      className="track__meter"
                      role="progressbar"
                      aria-valuenow={job.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${job.file.name} conversion progress`}
                    >
                      <div
                        className="track__meter-fill"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                    <div className="track__actions">
                      {job.status === 'done' ? (
                        <button
                          type="button"
                          className="btn btn--tiny"
                          onClick={() => downloadJob(job)}
                        >
                          Save
                        </button>
                      ) : (
                        <span className="track__status" aria-live="polite">
                          {job.status}
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn btn--tiny btn--remove"
                        onClick={() => removeJob(job.id)}
                        disabled={job.status === 'converting'}
                        aria-label={`Remove ${job.file.name}`}
                      >
                        &times;
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
      <footer
        className={`statusbar statusbar--${statusTone}`}
        role="status"
        aria-live="polite"
      >
        {statusText}
      </footer>
    </div>
  );
}
