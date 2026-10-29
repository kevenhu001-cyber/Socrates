import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';

export interface TutorMistakeFilterProps {
  value: string;
  labels: { all: string; unresolved: string; resolved: string };
  onChange: (value: string) => void;
}

export function TutorMistakeFilter({ value, labels, onChange }: TutorMistakeFilterProps) {
  return (
    <ToggleGroup
      value={[value]}
      variant="outline"
      size="sm"
      spacing={1}
      className="mistake-filter-controls"
      aria-label={labels.all}
      onValueChange={(next) => { if (next[0]) onChange(next[0]); }}
    >
      <ToggleGroupItem type="button" value="all" data-v="all" className={`mistake-filter-btn${value === 'all' ? ' active' : ''}`}>
        {labels.all}
      </ToggleGroupItem>
      <ToggleGroupItem type="button" value="unresolved" data-v="unresolved" className={`mistake-filter-btn${value === 'unresolved' ? ' active' : ''}`}>
        {labels.unresolved}
      </ToggleGroupItem>
      <ToggleGroupItem type="button" value="resolved" data-v="resolved" className={`mistake-filter-btn${value === 'resolved' ? ' active' : ''}`}>
        {labels.resolved}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
