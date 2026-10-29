import { Button } from '../ui/shadcn/button';

export function TutorSnapshotAction({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button type="button" size="sm" variant="outline" className="kb-file-snapshot" onClick={onClick}>{label}</Button>;
}
