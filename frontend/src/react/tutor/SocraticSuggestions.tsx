import { Button } from '../ui/shadcn/button';

export function SocraticSuggestions({ prompts, onSelect }: { prompts: string[]; onSelect: (prompt: string) => void }) {
  return <>
    {prompts.map((prompt) => (
      <Button
        key={prompt}
        type="button"
        variant="secondary"
        size="sm"
        className="socratic-chip shrink-0"
        aria-label={prompt}
        onClick={() => onSelect(prompt)}
      >
        <span className="socratic-chip-icon" aria-hidden="true">◇</span>
        <span>{prompt}</span>
      </Button>
    ))}
  </>;
}
