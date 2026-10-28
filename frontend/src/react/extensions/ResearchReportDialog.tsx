import { Button as UiButton } from '../ui/Button';
import { useEffect, useMemo, useState } from 'react';
import type { Message, ResearchJob } from '@socrates/contracts';
import { fetchResearchReport } from '../../agent/researchJobsClient.ts';
import { t } from '../legacy/gateway';
import {
  FoundationDialog,
  FoundationDialogClose,
  FoundationDialogTitle,
} from '../dialog/FoundationDialog';

interface ResearchReportDialogProps {
  job: ResearchJob;
  onClose: () => void;
}

type ReportOutlineItem = { id: string; label: string };

function reportTextOf(message: Message | null): string {
  return String(message?.rawText || message?.content || '').trim();
}

function reportOutlineOf(text: string): ReportOutlineItem[] {
  return text.split(/\r?\n/)
    .map((line) => line.match(/^#{1,3}\s+(.+?)\s*#*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match?.[1]))
    .slice(0, 12)
    .map((match, index) => ({ id: `research-report-section-${index}`, label: match[1] }));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function downloadReport(text: string, query: string): void {
  if (!text) return;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${query.slice(0, 48).trim() || 'research-report'}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function ResearchReportNavigation({ outline }: { outline: ReportOutlineItem[] }) {
  return (
    <aside className="research-report-sidebar" aria-label={t('research.reportNavigation')}>
      <div className="research-report-sidebar-label">{t('research.reportNavigation')}</div>
      <a href="#research-report-body">{t('research.report')}</a>
      <a href="#research-report-plan">{t('research.plan')}</a>
      <a href="#research-report-sources">{t('research.sources')}</a>
      <a href="#research-report-activity">{t('research.activity')}</a>
      {outline.length ? <div className="research-report-outline">
        {outline.map((entry) => <a key={entry.id} href={`#${entry.id}`}>{entry.label}</a>)}
      </div> : null}
    </aside>
  );
}

function ResearchReportMetadata({ job }: { job: ResearchJob }) {
  return (
    <div className="research-report-meta" aria-label={t('research.reportSummary')}>
      <span>{t('research.completed')}</span>
      {job.sourceCount > 0 ? <span>{t('research.sourcesCount').replace('{count}', String(job.sourceCount))}</span> : null}
      {job.searched > 0 ? <span>{t('research.queriesCount').replace('{searched}', String(job.searched)).replace('{total}', String(job.plan.length || job.searched))}</span> : null}
      {job.completedAt ? <time dateTime={job.completedAt}>{formatDate(job.completedAt)}</time> : null}
    </div>
  );
}

function ResearchReportArticle({ text, outline }: { text: string; outline: ReportOutlineItem[] }) {
  return (
    <article id="research-report-body" className="research-report-article">
      {text.split(/\r?\n/).map((line, index) => {
        const heading = line.match(/^(#{1,3})\s+(.+?)\s*#*$/);
        if (heading) {
          const item = outline.find((entry) => entry.label === heading[2]);
          return <h3 key={index} id={item?.id}>{heading[2]}</h3>;
        }
        return line.trim() ? <p key={index}>{line}</p> : <div key={index} className="research-report-spacer" aria-hidden="true" />;
      })}
    </article>
  );
}

function ResearchReportSections({ job, message }: { job: ResearchJob; message: Message | null }) {
  return (
    <>
      <section id="research-report-plan" className="research-report-section">
        <h3>{t('research.plan')}</h3>
        <ol>{job.plan.map((step, index) => <li key={`${job.id}-step-${index}`} className={index < job.searched ? 'is-complete' : ''}>{step}</li>)}</ol>
      </section>

      <section id="research-report-sources" className="research-report-section">
        <h3>{t('research.sources')}</h3>
        {message?.citations?.length ? (
          <ol className="research-report-sources">
            {message.citations.map((citation) => <li key={citation.id}><a href={citation.url} target="_blank" rel="noreferrer">{citation.title || citation.source || citation.url}</a></li>)}
          </ol>
        ) : <p>{job.sourceCount > 0 ? t('research.sourcesSaved') : t('research.noSources')}</p>}
      </section>

      <section id="research-report-activity" className="research-report-section">
        <h3>{t('research.activity')}</h3>
        <p>{t('research.activitySummary').replace('{searched}', String(job.searched)).replace('{sources}', String(job.sourceCount))}</p>
      </section>
    </>
  );
}

function ResearchReportBody({
  job,
  message,
  text,
  outline,
  loading,
  failed,
}: {
  job: ResearchJob;
  message: Message | null;
  text: string;
  outline: ReportOutlineItem[];
  loading: boolean;
  failed: boolean;
}) {
  return (
    <main className="research-report-main">
      <ResearchReportMetadata job={job} />
      {loading ? <p className="research-report-state" role="status">{t('research.loadingReport')}</p> : null}
      {!loading && failed ? <p className="research-report-state" role="alert">{t('research.reportUnavailable')}</p> : null}
      {!loading && !failed && !text ? <p className="research-report-state" role="status">{t('research.reportUnavailable')}</p> : null}
      {!loading && !failed && text ? <ResearchReportArticle text={text} outline={outline} /> : null}
      <ResearchReportSections job={job} message={message} />
    </main>
  );
}

export function ResearchReportDialog({ job, onClose }: ResearchReportDialogProps) {
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const text = reportTextOf(message);
  const outline = useMemo(() => reportOutlineOf(text), [text]);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setFailed(false);
    void fetchResearchReport(job.id, controller.signal)
      .then((result) => {
        if (!current) return;
        setMessage(result || null);
        setLoading(false);
      })
      .catch(() => {
        if (!current) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [job.id]);

  return (
    <FoundationDialog
      id="researchReportOverlay"
      open={true}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      overlayClassName="research-report-backdrop"
      className="research-report-dialog"
      contentStyle={{ overflow: 'hidden', height: '100%', maxHeight: 'calc(100dvh - 2 * var(--ui-space-md))' }}
    >
      <header className="research-report-header">
        <div className="research-report-heading">
          <span className="research-report-eyebrow">{t('research.report')}</span>
          <FoundationDialogTitle className="research-report-title-wrap">
            <h2 id="research-report-title">{job.query}</h2>
          </FoundationDialogTitle>
        </div>
        <div className="research-report-header-actions">
          <UiButton type="button" className="research-report-icon-button" onClick={() => downloadReport(text, job.query)} disabled={!text} aria-label={t('research.downloadReport')} title={t('research.downloadReport')}>↓</UiButton>
          <FoundationDialogClose className="research-report-icon-button" onClick={onClose} aria-label={t('dialog.close', 'Close')}>×</FoundationDialogClose>
        </div>
      </header>

      <div className="research-report-layout">
        <ResearchReportNavigation outline={outline} />
        <ResearchReportBody
          job={job}
          message={message}
          text={text}
          outline={outline}
          loading={loading}
          failed={failed}
        />
      </div>
    </FoundationDialog>
  );
}

export default ResearchReportDialog;
