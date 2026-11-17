import { i18n } from '../../legacy/gateway';

/** One short, located line plus the calculation detail behind a disclosure. */
export function DemoIssue({ headline, details }: { headline: string; details: string[] }) {
  const lines = details.filter(Boolean);
  return (
    <div className="demo-issue">
      <p>{headline}</p>
      {lines.length ? (
        <details>
          <summary>{i18n('intui.demo.details', 'Details')}</summary>
          {lines.map((line, index) => <div key={index}>{line}</div>)}
        </details>
      ) : null}
    </div>
  );
}
