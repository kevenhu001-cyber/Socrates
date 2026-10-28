import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { Textarea as ShadcnTextarea } from '../ui/shadcn/textarea';
import { Button as UiButton } from '../ui/Button';
import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import type { AgentRunEvent } from '../../extensions/types';
import { researchClient, installResearchTracking } from '../../agent/researchJobsClient.ts';
import type { ResearchView } from '../../agent/researchController.ts';
import { t } from '../legacy/gateway';
import { ExploreStepper } from './ExploreStepper';
import { ResearchReportDialog } from './ResearchReportDialog';

function researchEvent(view: ResearchView): AgentRunEvent {
  const { job } = view;
  return { runId: job.id, workflow: 'deepResearch', stage: view.stage as AgentRunEvent['stage'],
    status: job.status === 'queued' ? 'pending' : job.status,
    message: t(`research.${view.reconnecting ? 'reconnecting' : view.stage}`),
    ...(job.plan.length && job.status === 'running' ? { current: job.searched, total: job.plan.length } : {}),
  };
}

const ERROR_KEYS: Record<string, string> = {
  research_no_sources: 'research.noSources',
  research_timeout: 'research.timeout',
  research_provider_unavailable: 'research.noProvider',
  research_quota_exceeded: 'research.quota',
  research_recovery_exhausted: 'research.exhausted',
};

function ResearchPlan({ job, expanded, running }: { job: ResearchView['job']; expanded: boolean; running: boolean }) {
  if (!expanded || !job.plan.length) return null;
  return (
    <div className="research-plan-panel" role="region" aria-label={t('research.steps')}>
      <div className="research-plan-head">
        <span className="research-plan-title">{t('research.plan')}</span>
        <span className="research-plan-progress">{t('research.progress').replace('{current}', String(Math.min(job.searched, job.plan.length))).replace('{total}', String(job.plan.length))}</span>
      </div>
      <ol className="research-plan-checklist">
        {job.plan.map((step, idx) => {
          const isStepDone = idx < job.searched;
          const isStepActive = idx === job.searched && running;
          const statusClass = isStepDone ? 'is-done' : isStepActive ? 'is-active' : 'is-pending';
          return (
            <li key={idx} className={`research-plan-step ${statusClass}`}>
              <span className="research-step-indicator" aria-hidden="true">
                {isStepDone ? (
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5l3 3 6.5-6.5" />
                  </svg>
                ) : isStepActive ? (
                  <span className="research-step-active-dot" />
                ) : (
                  <span className="research-step-pending-ring" />
                )}
              </span>
              <span className="research-step-text">{step}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ResearchJobMetrics({ job, expanded, onToggle }: { job: ResearchView['job']; expanded: boolean; onToggle: () => void }) {
  const hasPlan = Array.isArray(job.plan) && job.plan.length > 0;
  const totalSteps = hasPlan ? job.plan.length : job.searched;
  if (!(job.searched > 0 || job.sourceCount > 0 || hasPlan)) return null;
  return (
    <div className="research-job-metrics">
      <span className="research-metric-chip" title={t('research.queriesCount').replace('{searched}', String(job.searched)).replace('{total}', String(totalSteps))}>
        <svg className="research-metric-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
        <span>{t('research.queriesCount').replace('{searched}', String(job.searched)).replace('{total}', String(totalSteps))}</span>
      </span>

      {job.sourceCount > 0 ? (
        <span className="research-metric-chip" title={t('research.sourcesCount').replace('{count}', String(job.sourceCount))}>
          <svg className="research-metric-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 4h10M3 8h10M3 12h6" />
          </svg>
          <span>{t('research.sourcesCount').replace('{count}', String(job.sourceCount))}</span>
        </span>
      ) : null}

      {hasPlan ? (
        <UiButton type="button" className="research-toggle-steps-btn" aria-expanded={expanded} onClick={onToggle}>
          <span>{expanded ? t('research.hideSteps') : t('research.viewSteps')}</span>
          <svg className={`research-toggle-icon${expanded ? ' is-expanded' : ''}`} viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </UiButton>
      ) : null}
    </div>
  );
}

function ResearchFocusForm({ jobId, busy, onCancel, onSubmit }: { jobId: string; busy: boolean; onCancel: () => void; onSubmit: (instruction: string) => Promise<boolean> }) {
  const [instruction, setInstruction] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = instruction.trim();
    if (!value || busy) return;
    const accepted = await onSubmit(value);
    if (accepted) setInstruction('');
  };
  return (
    <form className="research-refine-form" onSubmit={(event) => { void submit(event); }}>
      <ShadcnLabel className="research-refine-label" htmlFor={`research-focus-${jobId}`}>{t('research.adjustFocusLabel')}</ShadcnLabel>
      <ShadcnTextarea
        id={`research-focus-${jobId}`}
        className="research-refine-input"
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder={t('research.adjustFocusPlaceholder')}
        maxLength={600}
        rows={2}
        aria-describedby={`research-focus-count-${jobId}`}
        disabled={busy}
        autoFocus
      />
      <div className="research-refine-actions">
        <span id={`research-focus-count-${jobId}`} className="research-refine-count">
          {t('research.focusCount').replace('{count}', String(instruction.length))}
        </span>
        <div className="research-refine-buttons">
          <UiButton type="button" onClick={onCancel} disabled={busy}>{t('research.dismissFocus')}</UiButton>
          <UiButton type="submit" disabled={busy || !instruction.trim()}>{t('research.applyFocus')}</UiButton>
        </div>
      </div>
    </form>
  );
}

function ResearchJobCard({ view, expanded, onToggle }: { view: ResearchView; expanded: boolean; onToggle: () => void }) {
  const { job } = view;
  const running = job.status === 'queued' || job.status === 'running';
  const completed = job.status === 'succeeded';
  const [refining, setRefining] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const submitFocus = async (instruction: string) => {
    const replacement = await researchClient.refine(job.id, instruction);
    if (replacement) setRefining(false);
    return Boolean(replacement);
  };

  return <article className="research-job" data-research-id={job.id} data-research-status={job.status} data-research-stage={view.stage}>
    <div className="research-job-context">
      <span className="research-job-context-label">{t('research.title')}</span>
      <span className="research-job-query" title={job.query}>{job.query}</span>
    </div>
    {job.focus ? <div className="research-job-focus"><span className="research-job-focus-label">{t('research.focusLabel')}</span><span>{job.focus}</span></div> : null}
    <ExploreStepper event={researchEvent(view)} />

    <ResearchJobMetrics job={job} expanded={expanded} onToggle={onToggle} />

    <ResearchPlan job={job} expanded={expanded} running={running} />

    {refining && running ? <ResearchFocusForm jobId={job.id} busy={view.busy} onCancel={() => setRefining(false)} onSubmit={submitFocus} /> : null}

    {completed ? <div className="research-complete-summary" role="status">{t('research.completed')}</div> : null}
    <div className="research-job-footer">
      {completed ? <UiButton type="button" className="research-report-open-btn" onClick={() => setReportOpen(true)}>{t('research.openReport')}</UiButton> : null}
      {running ? <UiButton type="button" aria-expanded={refining} disabled={view.busy} onClick={() => setRefining((open) => !open)}>{t('research.adjustFocus')}</UiButton> : null}
      {running ? <UiButton type="button" disabled={view.busy} onClick={() => { void researchClient.control(job.id, 'cancel'); }}>{t('research.cancel')}</UiButton> : null}
      {job.status === 'failed' || job.status === 'cancelled' ? <UiButton type="button" disabled={view.busy} onClick={() => { void researchClient.control(job.id, 'retry'); }}>{t('research.retry')}</UiButton> : null}
    </div>
    {job.error ? <p className="research-job-error" role="status">{t(ERROR_KEYS[job.error] || 'research.executionFailed')}</p> : null}
    {reportOpen ? <ResearchReportDialog job={job} onClose={() => setReportOpen(false)} /> : null}
  </article>;
}

export function ResearchJobs() {
  const snapshot = useSyncExternalStore(researchClient.subscribe, researchClient.getSnapshot, researchClient.getSnapshot);
  const [, refreshLanguage] = useReducer((revision: number) => revision + 1, 0);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

  useEffect(installResearchTracking, []);
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);

  // A plan is the user's main way to understand a long-running task. Open it
  // once for newly discovered active jobs, while preserving an explicit
  // collapse choice across later progress updates.
  useEffect(() => {
    const activePlans = snapshot.jobs
      .filter((view) => (view.job.status === 'queued' || view.job.status === 'running') && view.job.plan.length)
      .map((view) => view.job.id);
    if (!activePlans.length) return;
    setExpandedJobs((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const id of activePlans) {
        if (Object.prototype.hasOwnProperty.call(next, id)) continue;
        next[id] = true;
        changed = true;
      }
      return changed ? next : previous;
    });
  }, [snapshot.jobs]);

  if (!snapshot.scope || (!snapshot.jobs.length && !snapshot.pending && !snapshot.issue)) return null;

  const toggleSteps = (id: string) => {
    setExpandedJobs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return <section className="research-jobs" aria-label={t('research.title')}>
    {snapshot.pending ? <div className="research-job-notice" role="status">
      <span>{t(snapshot.submitting ? 'research.submitting' : 'research.submitUncertain')}</span>
      {!snapshot.submitting ? <UiButton type="button" onClick={() => { void researchClient.submit(); }}>{t('research.retrySubmit')}</UiButton> : null}
      {!snapshot.submitting ? <UiButton type="button" onClick={researchClient.discardPending}>{t('research.dismissSubmit')}</UiButton> : null}
    </div> : null}
    {snapshot.issue ? <div className="research-job-notice" role="alert">
      <span>{t(`research.issue.${snapshot.issue}`)}</span>
      <UiButton type="button" onClick={() => { void researchClient.refresh(); }}>{t('research.refresh')}</UiButton>
    </div> : null}
    {snapshot.jobs.map((view) => (
      <ResearchJobCard key={view.job.id} view={view} expanded={!!expandedJobs[view.job.id]} onToggle={() => toggleSteps(view.job.id)} />
    ))}
  </section>;
}
