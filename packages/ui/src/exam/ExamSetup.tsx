/** Setup screen: paper settings before generation. */
import { EXAM_DIFFICULTIES, type ExamDraft, type ExamDraftPatch } from '@socrates/core';
import { dataAttributes } from '../domProps';
import { S } from '../look';
import { UiText } from '../primitives/UiText';
import {
  ExamLabel,
  ExamSection,
  ExamSegmented,
  ExamSelect,
  ExamStepper,
  ExamTextArea,
  ExamTextField,
  ExamTypeCards,
} from './controls';
import type { ExamIds } from './model';
import type { ExamStrings } from './strings';

export function ExamSetup({
  draft,
  providers,
  strings,
  ids,
  onDraftChange,
}: {
  draft: ExamDraft;
  providers: readonly { id: string; label: string }[];
  strings: ExamStrings;
  ids?: ExamIds;
  onDraftChange(patch: ExamDraftPatch): void;
}) {
  const t = strings.setup;
  const difficulties = EXAM_DIFFICULTIES.map((id) => ({
    id: id as string,
    label: t.difficulties[id] ?? id,
  }));
  const typeCards = (['mc', 'fb', 'sa'] as const).map((id) => ({ id, ...t.typeCards[id] }));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: 720,
        alignSelf: 'center',
        gap: S[300],
      }}
    >
      <div
        {...dataAttributes({ examHero: 1 })}
        style={{ display: 'flex', flexDirection: 'column', gap: S[75] }}
      >
        <UiText variant="eyebrow" tone="tertiary">
          {t.eyebrow}
        </UiText>
        <UiText variant="title">{t.heroTitle}</UiText>
        <UiText variant="body" tone="secondary">
          {t.heroDescription}
        </UiText>
      </div>

      <ExamSection index="01" title={t.topic} help={t.topicHelp}>
        <ExamTextField
          id={ids?.topic}
          label={t.topic}
          value={draft.topic}
          placeholder={t.topicPlaceholder}
          autoComplete="off"
          onChange={(topic) => onDraftChange({ topic })}
        />
      </ExamSection>

      <ExamSection index="02" title={t.settings} help={t.settingsHelp}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[200] }}>
          <ExamSelect
            id={ids?.modelTrigger}
            label={t.model}
            value={draft.model}
            placeholder={t.modelPlaceholder}
            options={providers}
            emptyLabel={t.noModels}
            onChange={(model) => onDraftChange({ model })}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              gap: S[200],
            }}
          >
            <div style={{ flexGrow: 1, minWidth: 220 }}>
              <ExamSegmented
                label={t.difficulty}
                value={draft.difficulty}
                options={difficulties}
                onChange={(difficulty) => onDraftChange({ difficulty })}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[50] }}>
              <ExamLabel>{t.count}</ExamLabel>
              <ExamStepper
                valueId={ids?.count}
                value={draft.count}
                min={1}
                max={50}
                fewerLabel={t.fewer}
                moreLabel={t.more}
                onChange={(count) => onDraftChange({ count })}
              />
            </div>
          </div>
        </div>
      </ExamSection>

      <ExamSection index="03" title={t.types} help={t.typesHelp}>
        <ExamTypeCards
          label={t.types}
          selection={draft.selectedTypes}
          options={typeCards}
          onChange={(selectedTypes) => onDraftChange({ selectedTypes })}
        />
      </ExamSection>

      <ExamSection index="04" title={t.instructions} help={t.instructionsHelp}>
        <ExamTextArea
          id={ids?.instructions}
          label={t.instructions}
          value={draft.instructions}
          placeholder={t.instructionsPlaceholder}
          onChange={(instructions) => onDraftChange({ instructions })}
        />
      </ExamSection>
    </div>
  );
}
