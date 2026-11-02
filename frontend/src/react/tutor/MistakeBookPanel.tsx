/**
 * RN-5 adapter for the shared mistake book (packages/ui/src/study): reads the
 * KB store, writes the filter back, and hands "Redo" to the existing redo
 * command (ui/mistakeBookCommands → the widget runtime re-mounts the item).
 */
import { MistakeBook, defaultMistakeStrings, type MistakeStrings } from '@socrates/ui/study';
import { dispatchKb, useKbStore } from '../../store/index.ts';
import { formatRelativeTime } from '../../ui/recentsHelpers.ts';
import { requestMistakeRedo } from '../../ui/mistakeBookCommands.ts';
import { i18n } from '../legacy/gateway';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';

function mistakeStrings(): MistakeStrings {
  const d = defaultMistakeStrings;
  return {
    title: i18n('sidebar.mistakeBook', d.title),
    filterLabel: i18n('mistakes.filterLabel', d.filterLabel),
    filter: {
      all: i18n('tutor.mistakeFilterAll', d.filter.all),
      unresolved: i18n('tutor.mistakeFilterUnresolved', d.filter.unresolved),
      resolved: i18n('tutor.mistakeFilterResolved', d.filter.resolved),
    },
    empty: i18n('mistakes.empty', d.empty),
    emptyHint: i18n('mistakes.emptyHint', d.emptyHint),
    filterEmptyResolved: i18n('mistakes.filterEmptyResolved', d.filterEmptyResolved),
    filterEmptyOther: i18n('mistakes.filterEmptyOther', d.filterEmptyOther),
    conquered: i18n('mistakes.conquered', d.conquered),
    redo: i18n('mistakes.redo', d.redo),
    redoneOne: i18n('mistakes.redoneOne', d.redoneOne),
    redoneMany: i18n('mistakes.redoneMany', d.redoneMany),
    yourAnswer: i18n('mistakes.yourAnswer', d.yourAnswer),
    correctAnswer: i18n('mistakes.correctAnswer', d.correctAnswer),
    noAnswer: i18n('mistakes.noAnswer', d.noAnswer),
    showDetail: i18n('mistakes.showDetail', d.showDetail),
    hideDetail: i18n('mistakes.hideDetail', d.hideDetail),
    options: i18n('mistakes.options', d.options),
    untitledTopic: i18n('mistakes.otherTopic', d.untitledTopic),
    typeLabel: (type) => (type ? i18n(`mistakes.type.${type}`, type) : ''),
    time: (timestamp) => (timestamp ? formatRelativeTime(timestamp) : ''),
  };
}

export function MistakeBookPanel() {
  const mistakes = useKbStore((snapshot) => snapshot.mistakes);
  const filter = useKbStore((snapshot) => snapshot.mistakeFilter);
  useLocaleRefresh();
  return (
    <div className="mistake-book-rn" id="mistakesList">
      <WebUiTheme>
        <MistakeBook
          mistakes={mistakes}
          filter={filter}
          strings={mistakeStrings()}
          onFilter={(value) => dispatchKb({ type: 'kb/set', key: 'mistakeFilter', value })}
          onRedo={requestMistakeRedo}
        />
      </WebUiTheme>
    </div>
  );
}
