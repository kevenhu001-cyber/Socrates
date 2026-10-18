import { useEffect, useReducer, useSyncExternalStore } from 'react';
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
  useEffect(installResearchTracking, []);
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
  if (!snapshot.scope || (!snapshot.jobs.some((view) => view.job.status !== 'succeeded') && !snapshot.pending && !snapshot.issue)) return null;
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
      return <article className="research-job" key={job.id} data-research-id={job.id}>
        <ExploreStepper event={researchEvent(view)} />
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
