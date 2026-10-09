import { getConnectorIconMarkup } from '../../../connector-icons';

/* Bundled brand marks keep the directory independent of remote image hosts. */
export function ConnectorMark({ id, name }: { id: string; name: string }) {
  const markup = getConnectorIconMarkup(id) || getConnectorIconMarkup(name);
  if (markup) {
    return (
      <span className="connector-mark-wrap">
        <span dangerouslySetInnerHTML={{ __html: markup }} />
      </span>
    );
  }
  return <span className="connector-logo-fallback" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>;
}
