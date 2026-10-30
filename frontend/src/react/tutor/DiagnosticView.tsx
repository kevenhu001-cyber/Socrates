import { Button } from '../ui/shadcn/button';

export interface DiagOption {
  letter: string;
  text: string;
}

export interface DiagResultNode {
  name: string;
  status: 'fuzzy' | 'blank';
}

export type DiagnosticScreen =
  | {
      kind: 'loading';
      loadingText: string;
      percent: number;
      step: string;
      cancelLabel: string;
    }
  | {
      kind: 'question';
      numberLabel: string;
      questionHtml: string;
      options: DiagOption[];
      selected: number | null;
      isFirst: boolean;
      isLast: boolean;
      labels: { back: string; skip: string; next: string; begin: string };
    }
  | {
      kind: 'results';
      title: string;
      noticeHtml: string;
      nodes: DiagResultNode[];
      summary: string;
      continueLabel: string;
      statusLabels: { fuzzy: string; blank: string };
    }
  | {
      kind: 'error';
      title: string;
      reason: string;
      retryLabel: string;
      builtinLabel: string;
    };

const CARD = 'mx-auto flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-border bg-card p-6 text-card-foreground md:p-8';

/* Every control carries `data-diag-command`; `tutor/diagnosticFlow.ts` keeps
   one delegated listener on `#diagnosticView` and dispatches from it. */
export function DiagnosticView({ screen }: { screen: DiagnosticScreen }) {
  if (screen.kind === 'loading') return <DiagnosticLoading screen={screen} />;
  if (screen.kind === 'question') return <DiagnosticQuestion screen={screen} />;
  if (screen.kind === 'results') return <DiagnosticResults screen={screen} />;
  return <DiagnosticErrorScreen screen={screen} />;
}

function DiagnosticLoading({ screen }: { screen: Extract<DiagnosticScreen, { kind: 'loading' }> }) {
  return (
    <div className={`${CARD} diag-loading items-center justify-center gap-3 py-14 text-center`}>
      <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" aria-hidden="true" />
      <p className="diag-loading-text text-sm text-muted-foreground">{screen.loadingText}</p>
      <div className="w-full max-w-[300px]">
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={screen.percent}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${screen.percent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2.5 animate-spin rounded-full border border-muted-foreground/30 border-t-primary" aria-hidden="true" />
          <span>{screen.step}</span>
        </div>
      </div>
      <Button variant="outline" size="sm" className="diag-cancel-btn mt-1" data-diag-command="cancel">
        {screen.cancelLabel}
      </Button>
    </div>
  );
}

function DiagnosticQuestion({ screen }: { screen: Extract<DiagnosticScreen, { kind: 'question' }> }) {
  const answered = screen.selected !== null && screen.selected >= 0;
  const advance = screen.isLast ? 'finish' : 'next';

  return (
    <div className={CARD}>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{screen.numberLabel}</div>

      <div
        className="diag-text text-base leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2"
        dangerouslySetInnerHTML={{ __html: screen.questionHtml }}
      />

      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={screen.numberLabel}>
        {screen.options.map((option, index) => {
          const selected = screen.selected === index;
          return (
            <Button
              key={option.letter + index}
              variant="outline"
              role="radio"
              aria-checked={selected}
              data-diag-command="select"
              data-diag-index={index}
              className={`h-auto w-full items-start justify-start gap-3 rounded-lg px-3.5 py-2.5 text-left font-normal whitespace-normal ${
                selected
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                }`}
                aria-hidden="true"
              >
                {option.letter}
              </span>
              <span
                className="text-sm leading-relaxed [&_a]:text-primary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: option.text }}
              />
            </Button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          data-diag-command="previous"
          style={screen.isFirst ? { visibility: 'hidden' } : undefined}
        >
          {screen.labels.back}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" data-diag-command="skip">
            {screen.labels.skip}
          </Button>
          <Button size="sm" data-diag-command={advance} disabled={!answered}>
            {screen.isLast ? screen.labels.begin : screen.labels.next}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DiagnosticResults({ screen }: { screen: Extract<DiagnosticScreen, { kind: 'results' }> }) {
  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-5 py-2">
      <div className="text-center text-lg font-semibold text-foreground">{screen.title}</div>

      <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground italic">
          i
        </span>
        <div
          className="text-[13px] leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground"
          dangerouslySetInnerHTML={{ __html: screen.noticeHtml }}
        />
      </div>

      <div className="flex flex-col gap-2">
        {screen.nodes.map((node, index) => {
          const fuzzy = node.status === 'fuzzy';
          return (
            <div
              key={node.name + index}
              className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
                fuzzy ? 'border-primary/25 bg-primary/5' : 'border-border bg-background'
              }`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-md font-mono text-[13px] font-semibold ${
                  fuzzy ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                {index + 1}
              </span>
              <span className="flex-1 text-sm font-medium text-foreground">{node.name}</span>
              <span className="shrink-0 text-[11px] tracking-wide text-muted-foreground uppercase">
                {fuzzy ? screen.statusLabels.fuzzy : screen.statusLabels.blank}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-center text-[13px] text-muted-foreground">{screen.summary}</div>

      <div className="flex justify-center pt-1">
        <Button data-diag-command="proceed" className="px-8">
          {screen.continueLabel}
        </Button>
      </div>
    </div>
  );
}

function DiagnosticErrorScreen({ screen }: { screen: Extract<DiagnosticScreen, { kind: 'error' }> }) {
  return (
    <div className="diag-error mx-auto flex w-full max-w-[520px] flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-foreground">{screen.title}</p>
      {screen.reason ? <p className="max-w-[340px] text-xs break-words text-muted-foreground">{screen.reason}</p> : null}
      <div className="mt-1 flex gap-2.5">
        <Button size="sm" data-diag-command="retry">
          {screen.retryLabel}
        </Button>
        <Button variant="outline" size="sm" data-diag-command="builtin">
          {screen.builtinLabel}
        </Button>
      </div>
    </div>
  );
}
