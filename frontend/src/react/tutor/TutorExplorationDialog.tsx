import { useEffect, useRef } from 'react';
import { Button } from '../ui/shadcn/button';
import { Input } from '../ui/shadcn/input';
import { Label } from '../ui/shadcn/label';

export interface TutorExplorationDialogProps {
  isZh: boolean;
  onSkip: () => void;
  onStart: (count: string) => void;
}

export function TutorExplorationDialog({ isZh, onSkip, onStart }: TutorExplorationDialogProps) {
  const countRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    countRef.current?.focus();
    countRef.current?.select();
  }, []);

  return (
    <section className="tutor-explore-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorExploreTitle">
      <div className="tutor-explore-kicker">{isZh ? '可选的学习起点' : 'Optional starting point'}</div>
      <h2 id="tutorExploreTitle">{isZh ? '先厘清你的知识边界吗？' : 'Explore your knowledge boundary first?'}</h2>
      <p>{isZh ? '回答几道选择题可以帮助导师调整起点。你也可以跳过，直接开始学习。' : 'A short multiple-choice exploration helps the tutor choose a starting point. You can also skip it and begin learning.'}</p>
      <div className="tutor-explore-count">
        <Label htmlFor="tutorExploreCount">{isZh ? '问题数量' : 'Number of questions'}</Label>
        <Input
          ref={countRef}
          id="tutorExploreCount"
          className="tutor-explore-count-input h-(--ui-control-touch) text-center text-lg font-semibold"
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          defaultValue={5}
          aria-describedby="tutorExploreCountHint"
        />
        <small id="tutorExploreCountHint">{isZh ? '1 至 10 道，全部为选择题' : '1 to 10, all multiple choice'}</small>
      </div>
      <div className="tutor-explore-actions">
        <Button variant="outline" size="touch" className="tutor-explore-skip" onClick={onSkip}>
          {isZh ? '直接开始' : 'Start without questions'}
        </Button>
        <Button size="touch" className="tutor-explore-start" onClick={() => onStart(countRef.current?.value || '5')}>
          {isZh ? '开始探索' : 'Start exploration'}
        </Button>
      </div>
    </section>
  );
}
