import { Button } from '../ui/shadcn/button';

export function SharedExamFooterAction({ label }: { label: string }) {
  return <Button type="button" variant="outline" size="sm" data-exam-command="close">{label}</Button>;
}
