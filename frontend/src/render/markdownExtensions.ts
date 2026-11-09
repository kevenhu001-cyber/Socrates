/**
 * Unified Markdown Extensions for marked.
 *
 * Implements the unified container contract (`.ds-table-wrap > table.ds-table`)
 * across all Markdown tables, preserving column alignments, accessibility attributes,
 * and keyboard-accessible horizontal scrolling.
 */
interface MarkedRendererInstance {
  use?: (extension: {
    renderer?: {
      table?: (header: string, body: string) => string;
    };
  }) => void;
  __socratesTableExtension?: boolean;
}

export function installMarkedExtensions(markedInstance: unknown): void {
  const target = markedInstance as MarkedRendererInstance | null | undefined;
  if (!target || target.__socratesTableExtension) return;
  target.__socratesTableExtension = true;

  if (typeof target.use === 'function') {
    target.use({
      renderer: {
        table(header: string, body: string): string {
          const thead = header ? `<thead>\n${header}</thead>\n` : '';
          const tbody = body ? `<tbody>\n${body}</tbody>` : '';
          return (
            '<div class="ds-table-wrap" role="region" tabindex="0" aria-label="Data table">\n' +
            '<table class="ds-table">\n' +
            thead +
            tbody +
            '</table>\n' +
            '</div>\n'
          );
        },
      },
    });
  }
}
