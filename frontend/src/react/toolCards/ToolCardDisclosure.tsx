import { Button } from '../ui/shadcn/button';

export function ToolCardDisclosure({ contentHtml, detailId }: { contentHtml: string; detailId: string }) {
  return (
    <Button type="button" variant="ghost" className="agent-tool-head" aria-expanded="false" aria-controls={detailId}>
      <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </Button>
  );
}
