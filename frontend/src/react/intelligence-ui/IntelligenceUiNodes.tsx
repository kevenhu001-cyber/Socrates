import { LazyOpenUiBlock } from './LazyOpenUiBlock';
import {
  intelligenceUiChartDomain,
  isSafeIntelligenceUiStateKey,
  normalizeIntelligenceUiImageUrl,
  normalizeIntelligenceUiTone,
  normalizeIntelligenceUiTrend,
  type IntelligenceUiNode,
  type IntelligenceUiTrend,
} from '@socrates/core';
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

import {
  asNumber,
  asProse,
  asText,
  executeAction,
  isRecord,
  resolve,
  resolveVisible,
  setBoundValue,
  type RenderContext,
  type UiAction,
} from './renderRuntime';

function renderChildren(node: IntelligenceUiNode, context: RenderContext): ReactNode {
  const children = context.children.get(node.id) || [];
  return children.map((child) => <UiNode key={child.id} node={child} context={context} />);
}

function UiPanel({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const title = asProse(resolve(node.title, context));
  const description = asProse(resolve(node.description, context));
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
  const style = { '--intui-columns': columns } as CSSProperties;
  return (
    <div className="intui-grid" data-intui-id={node.id} style={style}>
      {renderChildren(node, context)}
    </div>
  );
}

function UiText({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const text = asProse(resolve(node.text ?? node.value, context));
  if (!text) return null;
  return <p className="intui-text" data-intui-id={node.id}>{text}</p>;
}

function inferredMetricTrend(deltaText: string): IntelligenceUiTrend | null {
  if (!deltaText) return null;
  const normalized = deltaText.trim();
  if (/^[+-]?0(?:\.0+)?%?$/.test(normalized)) return 'flat';
  return normalized.startsWith('-') ? 'down' : 'up';
}

function UiMetric({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const label = asProse(resolve(node.label, context));
  const value = asText(resolve(node.value, context));
  const prefix = asText(resolve(node.prefix, context));
  const suffix = asText(resolve(node.suffix, context));
  const deltaText = asText(resolve(node.delta, context));
  const trend = normalizeIntelligenceUiTrend(resolve(node.trend, context)) ?? inferredMetricTrend(deltaText);
  return (
    <div className="intui-metric" data-intui-id={node.id}>
      {label ? <div className="intui-metric-label">{label}</div> : null}
      <div className="intui-metric-value">{prefix}{value}{suffix}</div>
      {deltaText ? (
        <div className="intui-metric-delta" data-trend={trend || 'flat'}>
          <span aria-hidden="true">{trend === 'down' ? '↓' : trend === 'up' ? '↑' : '→'}</span>
          <span>{deltaText}</span>
        </div>
      ) : null}
      {renderChildren(node, context)}
    </div>
  );
}

function UiProgress({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const label = asProse(resolve(node.label, context));
  const rawValue = asNumber(resolve(node.value, context), 0);
  const max = Math.max(1, asNumber(resolve(node.max, context), 100));
  const value = Math.max(0, Math.min(max, rawValue));
  const percent = value / max * 100;
  const valueText = asProse(resolve(node.displayValue, context)) || `${Math.round(percent)}%`;
  const tone = normalizeIntelligenceUiTone(resolve(node.tone, context));
  return (
    <div className="intui-progress" data-intui-id={node.id} data-tone={tone}>
      <div className="intui-progress-head">
        {label ? <span>{label}</span> : <span />}
        <span>{valueText}</span>
      </div>
      <div
        className="intui-progress-track"
        role="progressbar"
        aria-label={label || valueText}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
      >
        <span className="intui-progress-value" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function UiCallout({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const title = asProse(resolve(node.title, context));
  const text = asProse(resolve(node.text, context));
  const tone = normalizeIntelligenceUiTone(resolve(node.tone, context));
  return (
    <aside className="intui-callout" data-intui-id={node.id} data-tone={tone} role="note">
      {title ? <div className="intui-callout-title">{title}</div> : null}
      {text ? <div className="intui-callout-text">{text}</div> : null}
      {renderChildren(node, context)}
    </aside>
  );
}

function UiSlider({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const bind = typeof node.bind === 'string' ? node.bind : '';
  if (!isSafeIntelligenceUiStateKey(bind)) return null;
  const min = asNumber(resolve(node.min, context), 0);
  const max = Math.max(min, asNumber(resolve(node.max, context), 100));
  const step = Math.max(Number.EPSILON, asNumber(resolve(node.step, context), 1));
  const value = Math.max(min, Math.min(max, asNumber(context.state[bind], min)));
  const label = asProse(resolve(node.label, context));
  const valueText = asProse(resolve(node.displayValue, context)) || asText(value);
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
        aria-label={label || 'Value'}
        aria-valuetext={valueText}
        onChange={(event) => setBoundValue(context, bind, Number(event.currentTarget.value))}
      />
    </label>
  );
}

function UiChoice({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const bind = typeof node.bind === 'string' ? node.bind : '';
  if (!isSafeIntelligenceUiStateKey(bind) || !Array.isArray(node.options)) return null;
  const label = asProse(resolve(node.label, context));
  const options = node.options.slice(0, 8).filter(isRecord);
  return (
    <fieldset className="intui-choice" data-intui-id={node.id}>
      {label ? <legend>{label}</legend> : null}
      <div className="intui-choice-options">
        {options.map((option, index) => {
          const optionValue = resolve(option.value, context);
          const optionLabel = asProse(resolve(option.label ?? option.value, context));
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

function UiToggle({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const bind = typeof node.bind === 'string' ? node.bind : '';
  if (!isSafeIntelligenceUiStateKey(bind)) return null;
  const label = asProse(resolve(node.label, context));
  const description = asProse(resolve(node.description, context));
  const bound = context.state[bind];
  const checked = typeof bound === 'boolean' ? bound : node.checked === true;
  return (
    <label className="intui-toggle" data-intui-id={node.id}>
      <span className="intui-toggle-copy">
        {label ? <span className="intui-toggle-label">{label}</span> : null}
        {description ? <span className="intui-toggle-description">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        aria-label={label || 'Toggle'}
        onChange={(event) => setBoundValue(context, bind, event.currentTarget.checked)}
      />
    </label>
  );
}

function UiButton({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const label = asProse(resolve(node.label, context));
  const action = isRecord(node.action) ? node.action as UiAction : null;
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
  const caption = asProse(resolve(node.caption ?? node.label ?? node.title, context));
  const normalizedColumns = columns.map((column, index) => {
    if (typeof column === 'string') return { key: column, label: column };
    if (isRecord(column)) {
      const key = typeof column.key === 'string' ? column.key : `col-${index}`;
      return { key, label: asProse(resolve(column.label ?? key, context)) };
    }
    return { key: `col-${index}`, label: '' };
  });
  return (
    <div className="intui-table-wrap" data-intui-id={node.id}>
      <table className="intui-table">
        <caption className={caption ? 'intui-table-caption' : 'sr-only'}>{caption || 'Table'}</caption>
        <thead>
          <tr>{normalizedColumns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const record = isRecord(row) ? row : {};
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

interface ChartPoint {
  label: string;
  value: number;
}

function resolvedChartPoints(node: IntelligenceUiNode, context: RenderContext): ChartPoint[] {
  if (!Array.isArray(node.points)) return [];
  const points: ChartPoint[] = [];
  for (const rawPoint of node.points.slice(0, 16)) {
    if (!isRecord(rawPoint)) continue;
    const value = asNumber(resolve(rawPoint.value, context), Number.NaN);
    if (!Number.isFinite(value)) continue;
    points.push({
      label: asProse(resolve(rawPoint.label, context)) || String(points.length + 1),
      value,
    });
  }
  return points;
}

function UiChart({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const points = resolvedChartPoints(node, context);
  if (!points.length) return null;
  const title = asProse(resolve(node.title, context));
  const kind = node.kind === 'line' ? 'line' : 'bar';
  const [domainMin, domainMax] = intelligenceUiChartDomain(points.map((point) => point.value));
  const range = Math.max(Number.EPSILON, domainMax - domainMin);
  const width = 320;
  const height = 128;
  const padX = 12;
  const padY = 12;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padY * 2;
  const xAt = (index: number) => padX + plotWidth * (index + 0.5) / points.length;
  const yAt = (value: number) => padY + (domainMax - value) / range * plotHeight;
  const baseline = yAt(0);
  const slotWidth = plotWidth / points.length;
  const barWidth = Math.max(3, Math.min(24, slotWidth * 0.62));
  const polyline = points.map((point, index) => `${xAt(index).toFixed(2)},${yAt(point.value).toFixed(2)}`).join(' ');

  return (
    <figure className="intui-chart" data-intui-id={node.id} data-kind={kind}>
      {title ? <figcaption className="intui-chart-title">{title}</figcaption> : null}
      <svg className="intui-chart-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title || 'Chart'}>
        <line className="intui-chart-axis" x1={padX} x2={width - padX} y1={baseline} y2={baseline} />
        {kind === 'bar' ? points.map((point, index) => {
          const y = yAt(point.value);
          const rectY = Math.min(y, baseline);
          const rectHeight = Math.max(1, Math.abs(baseline - y));
          return (
            <rect
              key={`${node.id}-bar-${index}`}
              className="intui-chart-bar"
              x={xAt(index) - barWidth / 2}
              y={rectY}
              width={barWidth}
              height={rectHeight}
              rx={2}
            >
              <title>{asProse(`${point.label}: ${asText(point.value)}`)}</title>
            </rect>
          );
        }) : (
          <>
            <polyline className="intui-chart-line" points={polyline} />
            {points.map((point, index) => (
              <circle
                key={`${node.id}-point-${index}`}
                className="intui-chart-point"
                cx={xAt(index)}
                cy={yAt(point.value)}
                r={2.5}
              >
                <title>{asProse(`${point.label}: ${asText(point.value)}`)}</title>
              </circle>
            ))}
          </>
        )}
      </svg>
      <div className="intui-chart-values">
        {points.map((point, index) => (
          <div className="intui-chart-value" key={`${node.id}-value-${index}`}>
            <span>{point.label}</span>
            <strong>{asText(point.value)}</strong>
          </div>
        ))}
      </div>
    </figure>
  );
}

interface TabItem {
  id: string;
  label: string;
}

function normalizedTabs(node: IntelligenceUiNode, context: RenderContext): TabItem[] {
  if (!Array.isArray(node.tabs)) return [];
  const tabs: TabItem[] = [];
  const seen = new Set<string>();
  for (const rawTab of node.tabs.slice(0, 8)) {
    if (!isRecord(rawTab)) continue;
    const id = typeof rawTab.id === 'string' ? rawTab.id.trim() : '';
    if (!isSafeIntelligenceUiStateKey(id) || seen.has(id)) continue;
    seen.add(id);
    tabs.push({ id, label: asProse(resolve(rawTab.label ?? id, context)) || id });
  }
  return tabs;
}

function UiTabs({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const tabs = normalizedTabs(node, context);
  const [localTab, setLocalTab] = useState(() => tabs[0]?.id || '');
  if (!tabs.length) return null;
  const bind = typeof node.bind === 'string' && isSafeIntelligenceUiStateKey(node.bind) ? node.bind : '';
  const candidate = bind ? asText(context.state[bind]) : localTab;
  const active = tabs.some((tab) => tab.id === candidate) ? candidate : tabs[0].id;
  const children = context.children.get(node.id) || [];
  const panelId = `intui-tabpanel-${node.id}`;
  const activeTabId = `intui-tab-${node.id}-${active}`;

  const selectTab = (id: string) => {
    if (bind) setBoundValue(context, bind, id);
    else setLocalTab(id);
  };

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    let next: number;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    selectTab(tabs[next].id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  };

  return (
    <section className="intui-tabs" data-intui-id={node.id}>
      <div
        className="intui-tab-list"
        role="tablist"
        aria-label={asProse(resolve(node.label, context)) || 'Views'}
        aria-orientation="horizontal"
      >
        {tabs.map((tab, index) => (
          <button
            type="button"
            role="tab"
            id={`intui-tab-${node.id}-${tab.id}`}
            aria-controls={panelId}
            aria-selected={tab.id === active}
            tabIndex={tab.id === active ? 0 : -1}
            className={tab.id === active ? 'is-selected' : ''}
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="intui-tab-panel" id={panelId} role="tabpanel" aria-labelledby={activeTabId} tabIndex={0}>
        {children.map((child) => {
          const childTab = typeof child.tab === 'string' ? child.tab : '';
          if (childTab && childTab !== active) return null;
          return <UiNode key={child.id} node={child} context={context} />;
        })}
      </div>
    </section>
  );
}

function UiEntity({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const title = asProse(resolve(node.title, context));
  const subtitle = asProse(resolve(node.subtitle, context));
  const description = asProse(resolve(node.description, context));
  const imageUrl = normalizeIntelligenceUiImageUrl(resolve(node.image, context));
  const imageAlt = asProse(resolve(node.imageAlt, context)) || title;
  const fields = Array.isArray(node.fields) ? node.fields.slice(0, 6).filter(isRecord) : [];
  const action = isRecord(node.action) ? node.action as UiAction : null;
  const actionLabel = asProse(resolve(node.actionLabel, context));
  const promptDisabled = context.readOnly && action?.type === 'prompt';
  if (!title && !subtitle && !description && !imageUrl && !fields.length) return null;

  return (
    <article className="intui-entity" data-intui-id={node.id}>
      {imageUrl ? (
        <img
          className="intui-entity-image"
          src={imageUrl}
          alt={imageAlt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
        />
      ) : null}
      <div className="intui-entity-body">
        <div className="intui-entity-head">
          {title ? <div className="intui-entity-title">{title}</div> : null}
          {subtitle ? <div className="intui-entity-subtitle">{subtitle}</div> : null}
        </div>
        {description ? <p className="intui-entity-description">{description}</p> : null}
        {fields.length ? (
          <dl className="intui-entity-fields">
            {fields.map((field, index) => {
              const label = asProse(resolve(field.label, context));
              const value = asText(resolve(field.value, context));
              if (!label && !value) return null;
              return (
                <div key={`${node.id}-field-${index}`}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              );
            })}
          </dl>
        ) : null}
        {renderChildren(node, context)}
        {action && actionLabel ? (
          <button
            type="button"
            className="intui-button intui-entity-action"
            disabled={promptDisabled}
            onClick={(event) => executeAction(action, context, event)}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

interface GalleryImage {
  src: string;
  alt: string;
  caption: string;
}

function resolvedGalleryImages(node: IntelligenceUiNode, context: RenderContext): GalleryImage[] {
  if (!Array.isArray(node.images)) return [];
  const images: GalleryImage[] = [];
  for (const rawImage of node.images.slice(0, 8)) {
    if (!isRecord(rawImage)) continue;
    const src = normalizeIntelligenceUiImageUrl(resolve(rawImage.src, context));
    if (!src) continue;
    const caption = asProse(resolve(rawImage.caption, context));
    images.push({
      src,
      alt: asProse(resolve(rawImage.alt, context)) || caption,
      caption,
    });
  }
  return images;
}

function UiImageGallery({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const images = resolvedGalleryImages(node, context);
  if (!images.length) return null;
  const columns = Math.min(3, Math.max(1, Math.round(asNumber(resolve(node.columns, context), images.length === 1 ? 1 : 2))));
  const style = { '--intui-gallery-columns': columns } as CSSProperties;
  const label = asProse(resolve(node.label, context));
  return (
    <section className="intui-image-gallery-wrap" data-intui-id={node.id} aria-label={label || 'Image gallery'}>
      {label ? <div className="intui-gallery-label">{label}</div> : null}
      <div className="intui-image-gallery" style={style}>
        {images.map((image, index) => (
          <figure key={`${node.id}-image-${index}`}>
            <img
              src={image.src}
              alt={image.alt}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
            />
            {image.caption ? <figcaption>{image.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
    </section>
  );
}

export function UiNode({ node, context }: { node: IntelligenceUiNode; context: RenderContext }): ReactNode {
  if (!resolveVisible(node, context)) return null;
  switch (node.type) {
    case 'openui': return typeof node.source === 'string' ? <LazyOpenUiBlock source={node.source} readOnly={context.readOnly} open={context.streaming} embedded /> : null;
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
    case 'toggle': return <UiToggle node={node} context={context} />;
    case 'button': return <UiButton node={node} context={context} />;
    case 'table': return <UiTable node={node} context={context} />;
    case 'chart': return <UiChart node={node} context={context} />;
    case 'tabs': return <UiTabs node={node} context={context} />;
    case 'entity': return <UiEntity node={node} context={context} />;
    case 'image-gallery': return <UiImageGallery node={node} context={context} />;
    default: return null;
  }
}
