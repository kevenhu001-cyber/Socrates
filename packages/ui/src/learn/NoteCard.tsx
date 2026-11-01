/**
 * Reference cards with a thin label header: definition, theorem (with an
 * optional folded proof), standalone proof (collapsible, closed with ∎) and
 * key point. Bodies are host-rendered markdown + KaTeX.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { uiSpace } from '@socrates/theme';
import { UiText } from '../primitives/UiText';
import { useLearnHost } from './host';
import { proofNeedsQed } from './model';
import { ActionRow, PillAction, Rich, ScaffoldCard, Section } from './parts';

function Qed() {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
      <UiText variant="label" tone="ink" testID="proof-qed" aria-label="QED">∎</UiText>
    </View>
  );
}

function ProofBody({ title, body, part }: { title?: string; body: string; part: string }) {
  return (
    <View style={{ gap: uiSpace[2] }}>
      {title ? <Rich source={title} part={`${part}-title`} /> : null}
      <Rich source={body} part={`${part}-body`} />
      {proofNeedsQed(body) ? <Qed /> : null}
    </View>
  );
}

export function DefinitionCard({ term, body, testID }: { term: string; body: string; testID?: string }) {
  const { strings } = useLearnHost();
  return (
    <ScaffoldCard kind="definition" label={strings.label.definition} testID={testID}>
      {term ? <Rich source={term} part="definition-term" /> : null}
      {body ? <Rich source={body} part="definition-body" /> : null}
    </ScaffoldCard>
  );
}

export function KeyPointCard({ body, testID }: { body: string; testID?: string }) {
  const { strings } = useLearnHost();
  return (
    <ScaffoldCard kind="key-point" label={strings.label.keyPoint} testID={testID}>
      <Rich source={body} part="key-point-body" />
    </ScaffoldCard>
  );
}

export function TheoremCard({ title, statement, proofTitle, proofBody, testID }: {
  title?: string;
  statement: string;
  proofTitle?: string;
  proofBody?: string;
  testID?: string;
}) {
  const { strings } = useLearnHost();
  const [open, setOpen] = useState(false);
  return (
    <ScaffoldCard kind="theorem" label={strings.label.theorem} testID={testID}>
      {title ? <Rich source={title} part="theorem-title" /> : null}
      <Rich source={statement} part="theorem-statement" />
      {proofBody ? (
        <>
          <ActionRow>
            <PillAction
              label={open ? strings.proofHide : strings.proofShow}
              tone="quiet"
              chevron
              expanded={open}
              testID="theorem-proof-toggle"
              onPress={() => setOpen(!open)}
            />
          </ActionRow>
          {open ? (
            <Section label={strings.label.proof} testID="theorem-proof">
              <ProofBody title={proofTitle} body={proofBody} part="proof" />
            </Section>
          ) : null}
        </>
      ) : null}
    </ScaffoldCard>
  );
}

/** Standalone proof: open by default (it is the reply's content), foldable from the header. */
export function ProofCard({ title, body, testID }: { title?: string; body: string; testID?: string }) {
  const { strings } = useLearnHost();
  const [open, setOpen] = useState(true);
  return (
    <ScaffoldCard
      kind="proof"
      label={strings.label.proof}
      testID={testID}
      trailing={(
        <PillAction
          label={open ? strings.proofHide : strings.proofShow}
          tone="quiet"
          chevron
          expanded={open}
          testID="proof-toggle"
          onPress={() => setOpen(!open)}
        />
      )}
    >
      {open
        ? <ProofBody title={title} body={body} part="proof" />
        : (title ? <Rich source={title} part="proof-title" /> : <UiText variant="bodySm" tone="tertiary">…</UiText>)}
    </ScaffoldCard>
  );
}
