import { useEffect, useState } from 'react';
import { dispatchKb, useKbStore } from '../../store/index.ts';
import type { MistakeStateEntry } from '../../state/kb.ts';
import { formatRelativeTime } from '../../ui/recentsHelpers.ts';
import { requestMistakeRedo } from '../../ui/mistakeBookCommands.ts';
import { Button } from '../ui/shadcn/button';
import { i18n, t } from '../legacy/gateway';
import { TutorMistakeFilter } from './TutorMistakeFilter';

function mistakeIsResolved(mistake: MistakeStateEntry): boolean {
  return mistake.resolved === true || mistake.isResolved === true;
}

function mistakeOptions(mistake: MistakeStateEntry) {
  return (Array.isArray(mistake.options) ? mistake.options : []).map((option, index) => {
    if (typeof option === 'string') {
      return { letter: String.fromCharCode(65 + index), text: option };
    }
    return {
      letter: typeof option.letter === 'string' ? option.letter : String.fromCharCode(65 + index),
      text: typeof option.text === 'string' ? option.text : '',
    };
  });
}

function translate(key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

export function MistakeBookPanel() {
  const mistakes = useKbStore((snapshot) => snapshot.mistakes);
  const filter = useKbStore((snapshot) => snapshot.mistakeFilter);
  const [, setLanguageRevision] = useState(0);

  useEffect(() => {
    const refreshLanguage = () => setLanguageRevision((revision) => revision + 1);
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);

  const filtered = mistakes.filter((mistake) => {
    const resolved = mistakeIsResolved(mistake);
    if (filter === 'unresolved') return !resolved;
    if (filter === 'resolved') return resolved;
    return true;
  });

  const emptyMessage = mistakes.length === 0
    ? <>{translate('mistakes.empty', 'No mistakes yet')}<br />{translate('mistakes.emptyHint', 'Mistakes you make will appear here.')}</>
    : filter === 'resolved'
      ? translate('mistakes.filterEmptyResolved', 'No conquered mistakes yet.')
      : translate('mistakes.filterEmptyOther', 'No unresolved mistakes.')
      ;

  return (
    <>
      <div className="mistake-filter-bar tutor-only" id="mistakeFilterBar">
        <TutorMistakeFilter
          value={filter}
          labels={{
            all: i18n('tutor.mistakeFilterAll', 'All'),
            unresolved: i18n('tutor.mistakeFilterUnresolved', 'Unresolved'),
            resolved: i18n('tutor.mistakeFilterResolved', 'Resolved'),
          }}
          onChange={(value) => dispatchKb({ type: 'kb/set', key: 'mistakeFilter', value })}
        />
      </div>
      <div className="recents-header">
        <span className="recents-title" data-i18n-key="sidebar.mistakeBook">
          {i18n('sidebar.mistakeBook', 'Mistake Book')}
        </span>
      </div>
      <div id="mistakesList">
        {filtered.length === 0 ? (
          <div className="recents-empty">{emptyMessage}</div>
        ) : filtered.map((mistake) => {
          const resolved = mistakeIsResolved(mistake);
          const typeKey = `mistakes.type.${mistake.type || ''}`;
          const typeLabel = translate(typeKey, mistake.type || '');
          return (
            <article
              className={`mistake-card${resolved ? ' mistake-card-resolved' : ''}`}
              data-mistake-id={mistake.id}
              key={mistake.id}
            >
              <div className="mistake-meta">
                <span className="mistake-type">{typeLabel}</span>
                <span className="mistake-topic">{mistake.topic || ''}</span>
                <span className="mistake-time">{formatRelativeTime(mistake.timestamp)}</span>
                {resolved && <span className="mistake-resolved-tag">{t('mistakes.conquered')}</span>}
              </div>
              <div className="mistake-q">{mistake.q || ''}</div>
              <div className="mistake-opts">
                {mistakeOptions(mistake).map((option, index) => {
                  const tag = option.letter === mistake.correct
                    ? 'correct-tag'
                    : option.letter === mistake.userAnswer ? 'wrong-tag' : '';
                  return (
                    <div className={`mistake-opt ${tag}`.trim()} key={`${option.letter}-${index}`}>
                      <span className="mistake-opt-letter">{option.letter}</span>
                      <span>{option.text}</span>
                    </div>
                  );
                })}
              </div>
              {!!mistake.redoCount && (
                <div className="mistake-redo-count">
                  {mistake.redoCount === 1
                    ? t('mistakes.redoneOne')
                    : i18n('mistakes.redoneMany', `Redone ${mistake.redoCount} times`).replace('{n}', String(mistake.redoCount))}
                </div>
              )}
              <Button
                type="button"
                variant="default"
                size="sm"
                className="mistake-redo-btn w-full"
                data-redo={mistake.id}
                onClick={() => requestMistakeRedo(mistake.id)}
              >
                {t('mistakes.redo')}
              </Button>
            </article>
          );
        })}
      </div>
    </>
  );
}
