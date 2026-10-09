import type { ReactNode } from 'react';
import { scheduledText } from './scheduled.copy';

interface ScheduledRecommendationsProps {
  onSelect: (prompt: string) => void;
}

function TemplateIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function SunIcon() {
  return <TemplateIcon><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" /></TemplateIcon>;
}

function InboxIcon() {
  return <TemplateIcon><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" /></TemplateIcon>;
}

function SearchIcon() {
  return <TemplateIcon><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></TemplateIcon>;
}

function RobotIcon() {
  return <TemplateIcon><path d="M12 2.5V5" /><rect x="5" y="7" width="14" height="11" rx="3.5" /><path d="M9.5 11.5v2M14.5 11.5v2M10 15.5h4" /><path d="M2.8 10.5v3M21.2 10.5v3" /></TemplateIcon>;
}

function LaptopIcon() {
  return <TemplateIcon><rect x="4" y="4" width="16" height="11" rx="2" /><path d="M7.5 8h5M7.5 11h8" /><path d="M2.5 19h19" /></TemplateIcon>;
}

const RECOMMENDATIONS = [
  { icon: <SunIcon />, titleKey: 'scheduled.template.daily', titleFallback: 'Daily briefing', descriptionKey: 'scheduled.template.dailyDesc', descriptionFallback: 'Summarize the updates I care about each morning.', prompt: 'Send me a concise daily briefing with the latest updates on my saved topics.' },
  { icon: <InboxIcon />, titleKey: 'scheduled.template.inbox', titleFallback: 'Inbox check', descriptionKey: 'scheduled.template.inboxDesc', descriptionFallback: 'Surface messages that need my attention.', prompt: 'Check my inbox and tell me which messages need a reply or follow-up.' },
  { icon: <SearchIcon />, titleKey: 'scheduled.template.research', titleFallback: 'Weekly research pulse', descriptionKey: 'scheduled.template.researchDesc', descriptionFallback: 'Compare the latest work in a topic I follow.', prompt: 'Give me a weekly research briefing comparing the latest work on my chosen topic.' },
  { icon: <RobotIcon />, titleKey: 'scheduled.template.digest', titleFallback: 'AI research digest', descriptionKey: 'scheduled.template.digestDesc', descriptionFallback: 'Send the best new work every Friday.', prompt: 'Give me the best new AI research every Friday with a short explanation of why it matters.' },
  { icon: <LaptopIcon />, titleKey: 'scheduled.template.project', titleFallback: 'Project status', descriptionKey: 'scheduled.template.projectDesc', descriptionFallback: 'Keep me posted on progress and blockers.', prompt: 'Give me a weekly progress brief on my active project and its next milestone.' },
] as const;

export function ScheduledRecommendations({ onSelect }: ScheduledRecommendationsProps) {
  return (
    <>
      <div className="scheduled-section-heading">
        <span className="scheduled-heading-label">{scheduledText('scheduled.recommendations', 'Suggestions')}</span>
        <span>{scheduledText('scheduled.pickOne', 'Start with a template')}</span>
      </div>
      <div className="scheduled-recommendations">
        {RECOMMENDATIONS.map((recommendation) => (
          <button type="button" className="scheduled-recommendation" key={recommendation.titleKey} onClick={() => onSelect(recommendation.prompt)}>
            <span className="scheduled-recommendation-icon" aria-hidden="true">{recommendation.icon}</span>
            <span className="scheduled-recommendation-copy">
              <strong>{scheduledText(recommendation.titleKey, recommendation.titleFallback)}</strong>
              <small>{scheduledText(recommendation.descriptionKey, recommendation.descriptionFallback)}</small>
            </span>
            <span className="scheduled-recommendation-add" aria-hidden="true">+</span>
          </button>
        ))}
      </div>
    </>
  );
}
