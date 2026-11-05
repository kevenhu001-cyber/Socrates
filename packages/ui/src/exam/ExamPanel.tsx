/** Screen dispatcher: draws whichever state the host selected. */
import type { ReactNode } from 'react';
import type { ExamDraftPatch } from '../examModel';
import { ExamFooter } from './ExamFooter';
import { ExamNavigation } from './ExamNavigation';
import { ExamQuestionList } from './ExamQuestionList';
import { ExamResults } from './ExamResults';
import { ExamSetup } from './ExamSetup';
import { ExamStatus } from './ExamStatus';
import type { ExamCommandHandler, ExamIds, ExamScreen, RenderExamText } from './model';
import { defaultExamStrings, type ExamStrings } from './strings';

const plainText: RenderExamText = (text) => text;

export function ExamPanel({ screen, strings = defaultExamStrings, onCommand, onAnswer, onDraftChange, renderText = plainText, ids }: {
  screen: ExamScreen;
  strings?: ExamStrings;
  onCommand: ExamCommandHandler;
  onAnswer?(index: number, value: string | number): void;
  onDraftChange?(patch: ExamDraftPatch): void;
  renderText?: RenderExamText;
  ids?: ExamIds;
}): ReactNode {
  switch (screen.kind) {
    case 'form':
      return (
        <ExamSetup
          draft={screen.draft}
          providers={screen.providers}
          strings={strings}
          ids={ids}
          onDraftChange={(patch) => onDraftChange?.(patch)}
        />
      );
    case 'loading':
    case 'empty':
    case 'error':
      return <ExamStatus screen={screen} />;
    case 'questions':
      return (
        <ExamQuestionList
          questions={screen.questions}
          answers={screen.answers}
          readOnly={screen.readOnly}
          strings={strings}
          ids={ids}
          renderText={renderText}
          onAnswer={onAnswer}
        />
      );
    case 'results':
      return <ExamResults results={screen.results} renderText={renderText} />;
  }
}
