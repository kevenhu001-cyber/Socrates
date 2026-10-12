import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import {
  displayIntelligenceUiValue,
  initialStateForNodes,
  parseIntelligenceUiRecords,
  resolveIntelligenceUiValue,
  type IntelligenceUiNode,
  type IntelligenceUiState,
} from './model';
import type { ToolCallRecord } from '../tool-run/toolRunModel';

interface IntelligenceUiBlockProps {
  source: string;
  tools?: ReadonlyArray<ToolCallRecord>;
  open?: boolean;
  readOnly?: boolean;
}

interface RenderContext {
  state: IntelligenceUiState;
  setState: (updater: (previous: IntelligenceUiState) => IntelligenceUiState) => void;
  children: Map<string, IntelligenceUiNode[]>;
  tools: ReadonlyArray<ToolCallRecord>;
  readOnly: boolean;
}

type UiAction = {
  type?: string;
  key?: string;
  value?: unknown;
  amount?: unknown;
  prompt?: string;
  url?: string;
};

function asNumber(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asText(value: unknown): string {
  return displayIntelligenceUiValue(value);
}

function childMap(nodes: ReadonlyArray<IntelligenceUiNode>): Map<string, IntelligenceUiNode[]> {
  const map = new Map<string, IntelligenceUiNode[]>();
  for (const node of nodes) {
    if (!node.parent) continue;
    const list = map.get(node.parent) || [];
    list.push(node);
    map.set(node.parent, list);
  }
  return map;
}

function mergeDefaults(previous: IntelligenceUiState, defaults: IntelligenceUiState): IntelligenceUiState {
  let changed = false;
  const next = { ...previous };
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in previous)) {
      next[key] = value;
      changed = true;
    }
  }
  return changed ? next : previous;
}

function resolve(value: unknown, context: RenderContext): unknown {
  return resolveIntelligenceUiValue(value, { state: context.state, tools: context.tools });
}

function resolveVisible(node: IntelligenceUiNode, context: RenderContext): boolean {
  if (!('when' in node)) return true;
  return Boolean(resolve(node.when, context));
}

function renderChildren(node: IntelligenceUiNode, context: RenderContext): ReactNode {
  const children = context.children.get(node.id) || [];
  return children.map((child) => <UiNode key={child.id} node={child} context={context} />);
}

function setBoundValue(context: RenderContext, key: string, value: unknown): void {
  if (!key) return;
  context.setState((previous) => previous[key] === value ? previous : { ...previous, [key]: value });
}

function dispatchPrompt(event: MouseEvent<HTMLButtonElement>, prompt: string): void {
  if (!prompt.trim()) return;
  event.currentTarget.dispatchEvent(new CustomEvent('tool-retry', {
    bubbles: true,
    detail: { tool: 'intelligent_ui', prompt: prompt.trim() },
  }));
}

function openSafeUrl(rawUrl: string): void {
  try {
    const url = new URL(rawUrl, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    window.open(url.href, '_blank', 'noopener,noreferrer');
  } catch {
    /* Invalid model-provided URLs are inert by design. */
  }
}

function executeAction(action: UiAction, context: RenderContext, event: MouseEvent<HTMLButtonElement>): void {
  const type = typeof action.type === 'string' ? action.type : '';
  if (type === 'set' && typeof action.key === 'string') {
    setBoundValue(context, action.key, resolve(action.value, context));
    return;
  }
  if (type === 'increment' && typeof action.key === 'string') {
    const current = asNumber(context.state[action.key], 0);
    const amount = asNumber(resolve(action.amount, context), 1);
    setBoundValue(context, action.key, current + amount);
    return;
  }
  if (type === 'prompt' && typeof action.prompt === 'string' && !context.readOnly) {
    dispatchPrompt(event, action.prompt);
    return;
  }
  if (type === 'open_url' && typeof action.url === 'string') openSafeUrl(action.url);
}

function UiPanel({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const title = asText(resolve(node.title, context));
  const description = asText(resolve(node.description, context));
  return (
    <section className="intui-panel" data-intui-id={node.id}>
      {title || description ? (
        <header className="intui-panel-head">
          {title ? <div className="intui-panel-title">{title}</div> : null}
          {description ? <div className="intui-panel-description">{description}</div> : null}
        </header>
      ) : null}
      <div className="intui-panel-body">{renderChildren(node, context)}</div>
    </section>
  );
}

function UiStack({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  return <div className="intui-stack" data-intui-id={node.id}>{renderChildren(node, context)}</div>;
}

function UiGrid({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const columns = Math.min(4, Math.max(1, Math.round(asNumber(resolve(node.columns, context), 2))));
  return (
    <div className="intui-grid" data-intui-id={node.id} style={{ '--intui-columns': columns } as React.CSSProperties}>
      {renderChildren(node, context)}
    </div>
  );
}

function UiText({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const text = asText(resolve(node.text ?? node.value, context));
  if (!text) return null;
  return <p className="intui-text" data-intui-id={node.id}>{text}</p>;
}

function UiMetric({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const label = asText(resolve(node.label, context));
  const value = asText(resolve(node.value, context));
  const prefix = asText(resolve(node.prefix, context));
  const suffix = asText(resolve(node.suffix, context));
  return (
    <div className="intui-metric" data-intui-id={node.id}>
      {label ? <div className="intui-metric-label">{label}</div> : null}
      <div className="intui-metric-value">{prefix}{value}{suffix}</div>
      {renderChildren(node, context)}
    </div>
  );
}

function UiProgress({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const label = asText(resolve(node.label, context));
  const value = asNumber(resolve(node.value, context), 0);
  const max = Math.max(1, asNumber(resolve(node.max, context), 100));
  const percent = Math.max(0, Math.min(100, value / max * 100));
  return (
    <div className="intui-progress" data-intui-id={node.id}>
      <div className="intui-progress-head">
        {label ? <span>{label}</span> : <span />}
        <span>{asText(resolve(node.displayValue, context)) || `${Math.round(percent)}%`}</span>
      </div>
      <div className="intui-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <span className="intui-progress-value" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function UiCallout({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const title = asText(resolve(node.title, context));
  const text = asText(resolve(node.text, context));
  return (
    <aside className="intui-callout" data-intui-id={node.id}>
      {title ? <div className="intui-callout-title">{title}</div> : null}
      {text ? <div className="intui-callout-text">{text}</div> : null}
      {renderChildren(node, context)}
    </aside>
  );
}

function UiSlider({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const bind = typeof node.bind === 'string' ? node.bind : '';
  if (!bind) return null;
  const min = asNumber(resolve(node.min, context), 0);
  const max = Math.max(min, asNumber(resolve(node.max, context), 100));
  const step = Math.max(Number.EPSILON, asNumber(resolve(node.step, context), 1));
  const value = Math.max(min, Math.min(max, asNumber(context.state[bind], min)));
  const label = asText(resolve(node.label, context));
  const valueText = asText(resolve(node.displayValue, context)) || asText(value);
  return (
    <label className="intui-slider" data-intui-id={node.id}>
      <span className="intui-control-head">
        <span>{label}</span>
        <output>{valueText}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => setBoundValue(context, bind, Number(event.currentTarget.value))}
      />
    </label>
  );
}

function UiChoice({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const bind = typeof node.bind === 'string' ? node.bind : '';
  if (!bind || !Array.isArray(node.options)) return null;
  const label = asText(resolve(node.label, context));
  const options = node.options.slice(0, 8).filter((option) => option && typeof option === 'object') as Array<Record<string, unknown>>;
  return (
    <fieldset className="intui-choice" data-intui-id={node.id}>
      {label ? <legend>{label}</legend> : null}
      <div className="intui-choice-options">
        {options.map((option, index) => {
          const optionValue = resolve(option.value, context);
          const optionLabel = asText(resolve(option.label ?? option.value, context));
          const selected = context.state[bind] === optionValue;
          return (
            <button
              type="button"
              key={`${node.id}-${index}`}
              className={selected ? 'is-selected' : ''}
              aria-pressed={selected}
              onClick={() => setBoundValue(context, bind, optionValue)}
            >
              {optionLabel}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function UiButton({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const label = asText(resolve(node.label, context));
  const action = node.action && typeof node.action === 'object' ? node.action as UiAction : null;
  if (!label || !action) return null;
  const promptDisabled = context.readOnly && action.type === 'prompt';
  return (
    <button
      type="button"
      className={`intui-button${node.primary === true ? ' is-primary' : ''}`}
      data-intui-id={node.id}
      disabled={promptDisabled}
      onClick={(event) => executeAction(action, context, event)}
    >
      {label}
    </button>
  );
}

function UiTable({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const columns = Array.isArray(node.columns) ? node.columns.slice(0, 8) : [];
  const rows = Array.isArray(node.rows) ? node.rows.slice(0, 24) : [];
  if (!columns.length || !rows.length) return null;
  const normalizedColumns = columns.map((column, index) => {
    if (typeof column === 'string') return { key: column, label: column };
    if (column && typeof column === 'object') {
      const item = column as Record<string, unknown>;
      const key = typeof item.key === 'string' ? item.key : `col-${index}`;
      return { key, label: asText(resolve(item.label ?? key, context)) };
    }
    return { key: `col-${index}`, label: '' };
  });
  return (
    <div className="intui-table-wrap" data-intui-id={node.id}>
      <table className="intui-table">
        <thead>
          <tr>{normalizedColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
            return (
              <tr key={`${node.id}-row-${rowIndex}`}>
                {normalizedColumns.map((column) => (
                  <td key={column.key}>{asText(resolve(record[column.key], context))}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UiNode({ node, context }: { node: IntelligenceUiNode; context: RenderContext }): ReactNode {
  if (!resolveVisible(node, context)) return null;
  switch (node.type) {
    case 'panel': return <UiPanel node={node} context={context} />;
    case 'stack': return <UiStack node={node} context={context} />;
    case 'grid': return <UiGrid node={node} context={context} />;
    case 'text': return <UiText node={node} context={context} />;
    case 'metric': return <UiMetric node={node} context={context} />;
    case 'progress': return <UiProgress node={node} context={context} />;
    case 'divider': return <hr className="intui-divider" data-intui-id={node.id} />;
    case 'callout': return <UiCallout node={node} context={context} />;
    case 'slider': return <UiSlider node={node} context={context} />;
    case 'choice': return <UiChoice node={node} context={context} />;
    case 'button': return <UiButton node={node} context={context} />;
    case 'table': return <UiTable node={node} context={context} />;
    default: return null;
  }
}

export function IntelligenceUiBlock({ source, tools = [], open = false, readOnly = false }: IntelligenceUiBlockProps) {
  const nodes = useMemo(() => parseIntelligenceUiRecords(source), [source]);
  const defaults = useMemo(() => initialStateForNodes(nodes), [nodes]);
  const children = useMemo(() => childMap(nodes), [nodes]);
  const [state, setState] = useState<IntelligenceUiState>(() => defaults);

  useEffect(() => {
    setState((previous) => mergeDefaults(previous, defaults));
  }, [defaults]);

  const roots = nodes.filter((node) => !node.parent);
  if (!roots.length) return null;

  const context: RenderContext = {
    state,
    setState,
    children,
    tools,
    readOnly,
  };

  return (
    <div className="intui" data-intui-streaming={open ? 'true' : 'false'}>
      {roots.map((node) => <UiNode key={node.id} node={node} context={context} />)}
      {open ? <span className="intui-stream-dot" aria-hidden="true" /> : null}
    </div>
  );
}

export default IntelligenceUiBlock;
