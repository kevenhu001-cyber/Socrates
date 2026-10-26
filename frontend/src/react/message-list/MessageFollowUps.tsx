import React from 'react';
import { i18n } from '../legacy/gateway';
import { composerController } from '../../composer/controller.ts';

const SparkleIcon = (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" shapeRendering="geometricPrecision">
    <path d="m12 3 1.9 4.8a2 2 0 0 0 1.3 1.3L20 11l-4.8 1.9a2 2 0 0 0-1.3 1.3L12 19l-1.9-4.8a2 2 0 0 0-1.3-1.3L4 11l4.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
  </svg>
);

export function MessageFollowUps(): React.ReactElement {
  const [, refreshLanguage] = React.useReducer((r: number) => r + 1, 0);

  React.useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);

  const chips = [
    { key: 'chat.followUp.deepen', defaultText: 'Explain key concepts deeper' },
    { key: 'chat.followUp.example', defaultText: 'Give a concrete example' },
    { key: 'chat.followUp.summary', defaultText: 'Summarize key points' },
    { key: 'chat.followUp.quiz', defaultText: 'Quiz me on this' },
  ];

  const handleChipClick = (label: string) => {
    composerController.setMarkdown('chat', label);
    composerController.focus('chat');
  };

  return (
    <div className="msg-follow-ups" role="group" aria-label="Follow-up suggestions">
      {chips.map(({ key, defaultText }) => {
        const label = i18n(key, defaultText);
        return (
          <button
            key={key}
            type="button"
            className="msg-follow-up-chip"
            onClick={() => handleChipClick(label)}
          >
            {SparkleIcon}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
