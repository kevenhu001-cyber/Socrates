import { LearningFallback } from './LearningFallback';
import { learningUiIssues, normalizeLearningUiNode, type IntelligenceUiNode, type LearningUiNode } from '@socrates/core';
import {
  LearnMount, QuizScaffold, PracticeScaffold, DefinitionScaffold, FlashcardScaffold,
  ExampleScaffold, TheoremScaffold, ProofScaffold, DerivationScaffold, KeyPointScaffold, StepListScaffold,
} from '../tutor-widgets/LearnScaffolds';
import { BlockSkeleton } from './BlockSkeleton';

function questionSlot(node: LearningUiNode): string {
  const source=JSON.stringify([node.q??node.problem,node.options??null]);
  let hash=2166136261;
  for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619);
  return `learning-${node.id}-${(hash>>>0).toString(36)}`;
}

function Card({ node }: { node: LearningUiNode }) {
  const title=node.title || '';
  switch(node.kind) {
    case 'quiz': return <QuizScaffold key={JSON.stringify([node.q,node.options,node.correct,node.graded])}
      parsed={{q:node.q!,options:node.options!,correct:node.graded===false?null:node.correct!,multi:node.multi,explanation:node.explanation,slotId:questionSlot(node)}} />;
    case 'practice': return <PracticeScaffold parsed={{title,problem:node.problem!,solution:node.solution,correct:node.correct,hint:node.hint,hints:node.hints,slotId:questionSlot(node)}} />;
    case 'definition': return <DefinitionScaffold parsed={{term:node.term || title,body:node.body!}} />;
    case 'flashcard': return <FlashcardScaffold key={JSON.stringify([node.front,node.back])} parsed={{front:node.front!,back:node.back!}} />;
    case 'example': return <ExampleScaffold parsed={{title,problem:node.problem!,solution:node.solution!,hints:node.hints}} />;
    case 'theorem': return <TheoremScaffold parsed={{title,statement:node.statement!}} />;
    case 'proof': return <ProofScaffold parsed={{title,body:node.body!}} />;
    case 'derivation': return <DerivationScaffold parsed={{title,body:node.body!}} />;
    case 'key-point': return <KeyPointScaffold parsed={{body:node.body!}} />;
    case 'step': return <StepListScaffold steps={[{n:node.n || 1,body:node.body!}]} />;
  }
}

export default function LearningNode({ node, readOnly, streaming }: { node: IntelligenceUiNode; readOnly: boolean; streaming?: boolean }) {
  const normalized=normalizeLearningUiNode(node);
  const issues=learningUiIssues(normalized);
  if(issues.length)return streaming?<BlockSkeleton />:<LearningFallback node={node} />;
  const learning=normalized as LearningUiNode;
  return <div className="intui-learning" data-intui-id={node.id} data-learning-kind={learning.kind}>
    <LearnMount readOnly={readOnly || Boolean(streaming)}><Card node={learning} /></LearnMount>
  </div>;
}
