import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import type { AgentRunEvent } from '../../extensions/types';
import { researchClient, installResearchTracking } from '../../agent/researchJobsClient.ts';
import type { ResearchView } from '../../agent/researchController.ts';
import { t } from '../legacy/gateway';
import { ExploreStepper } from './ExploreStepper';

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

export function ResearchJobs() {
  const snapshot = useSyncExternalStore(researchClient.subscribe, researchClient.getSnapshot, researchClient.getSnapshot);
  const [, refreshLanguage] = useReducer((revision: number) => revision + 1, 0);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

  useEffect(installResearchTracking, []);
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);

  if (!snapshot.scope || (!snapshot.jobs.some((view) => view.job.status !== 'succeeded') && !snapshot.pending && !snapshot.issue)) return null;

  const toggleSteps = (id: string) => {
    setExpandedJobs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return <section className="research-jobs" aria-label={t('research.title')}>
    {snapshot.pending ? <div className="research-job-notice" role="status">
      <span>{t(snapshot.submitting ? 'research.submitting' : 'research.submitUncertain')}</span>
      {!snapshot.submitting ? <button type="button" onClick={() => { void researchClient.submit(); }}>{t('research.retrySubmit')}</button> : null}
      {!snapshot.submitting ? <button type="button" onClick={researchClient.discardPending}>{t('research.dismissSubmit')}</button> : null}
    </div> : null}
    {snapshot.issue ? <div className="research-job-notice" role="alert">
      <span>{t(`research.issue.${snapshot.issue}`)}</span>
      <button type="button" onClick={() => { void researchClient.refresh(); }}>{t('research.refresh')}</button>
    </div> : null}
    {snapshot.jobs.filter((view) => view.job.status !== 'succeeded').map((view) => {
      const { job } = view;
      const running = job.status === 'queued' || job.status === 'running';
      const isExpanded = !!expandedJobs[job.id];
      const hasPlan = Array.isArray(job.plan) && job.plan.length > 0;
      const totalSteps = hasPlan ? job.plan.length : job.searched;

      return <article className="research-job" key={job.id} data-research-id={job.id}>
        <ExploreStepper event={researchEvent(view)} />

        {(job.searched > 0 || job.sourceCount > 0 || hasPlan) ? (
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
              <button
                type="button"
                className="research-toggle-steps-btn"
                aria-expanded={isExpanded}
                onClick={() => toggleSteps(job.id)}
              >
                <span>{isExpanded ? t('research.hideSteps') : t('research.viewSteps')}</span>
                <svg
                  className={`research-toggle-icon${isExpanded ? ' is-expanded' : ''}`}
                  viewBox="0 0 16 16"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}

        {hasPlan && isExpanded ? (
          <div className="research-plan-panel" role="region" aria-label={t('research.steps')}>
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
        ) : null}

        <div className="research-job-footer">
          <span className="research-job-query" title={job.query}>{job.query}</span>
          {running ? <button type="button" disabled={view.busy} onClick={() => { void researchClient.control(job.id, 'cancel'); }}>{t('research.cancel')}</button> : null}
          {job.status === 'failed' || job.status === 'cancelled' ? <button type="button" disabled={view.busy} onClick={() => { void researchClient.control(job.id, 'retry'); }}>{t('research.retry')}</button> : null}
        </div>
        {job.error ? <p className="research-job-error" role="status">{t(ERROR_KEYS[job.error] || 'research.executionFailed')}</p> : null}
      </article>;
    })}
  </section>;
}
