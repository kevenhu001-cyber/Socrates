import { Button } from '../ui/shadcn/button';

export type ExamAction = {
  command: string;
  label: string;
  variant?: 'default' | 'outline' | 'destructive';
};

function ExamActionFooter({ actions, onCommand }: { actions: ExamAction[]; onCommand: (command: string) => void }) {
  return (
    <>
      {actions.map((action) => (
        <Button
          key={action.command}
          variant={action.variant ?? 'default'}
          className="exam-action-button"
          onClick={() => onCommand(action.command)}
        >
          {action.label}
        </Button>
      ))}
    </>
  );
}

export { ExamActionFooter };
