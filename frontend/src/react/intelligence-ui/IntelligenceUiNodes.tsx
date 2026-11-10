import { LazyLearningNode } from './LazyLearningNode';
import { NativeVisualization } from './NativeVisualization';
import { Demonstration } from './demonstration/Demonstration';
import { Label as ShadcnLabel } from '../ui/shadcn/label';
import { Switch as ShadcnSwitch } from '../ui/shadcn/switch';
import { NativeControl as ShadcnNativeControl } from '../ui/NativeControl';
import { Separator as ShadcnSeparator } from '../ui/Separator';
import { Button as BaseButton } from '../ui/Button';
import { PhysicsLab } from './physics/PhysicsLab';
import { LazyOpenUiBlock } from './LazyOpenUiBlock';
import { Icon } from '../../ui/Icon';
import { DeferredMenu } from '../menu/DeferredMenu';
import { i18n } from '../legacy/gateway';
import {
  isSafeIntelligenceUiStateKey,
  intelligentUiControlIssues,
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
  const [moreOpen, setMoreOpen] = useState(false);
  const title = asProse(resolve(node.title, context));
  const description = asProse(resolve(node.description, context));
  const children = context.children.get(node.id) || [];
  const actions = children.filter((child) => child.type === 'button' && asProse(resolve(child.label, context)) && isRecord(child.action));
  const content = children.filter((child) => child.type !== 'button');
  const primary = actions.find((child) => child.primary === true);
  const secondary = actions.find((child) => child !== primary && child.primary !== true) || actions.find((child) => child !== primary);
  const visibleActions = primary
    ? [secondary, primary].filter((child): child is IntelligenceUiNode => Boolean(child))
    : actions.slice(0, 2);
  const overflowActions = actions.filter((child) => !visibleActions.includes(child));
  return (
    <section className="intui-panel" data-intui-id={node.id}>
      {(title || description) && node.id !== context.surfaceRootId ? (
        <header className="intui-panel-head">
          {title ? <div className="intui-panel-title">{title}</div> : null}
          {description ? <div className="intui-panel-description">{description}</div> : null}
        </header>
      ) : null}
      <div className="intui-panel-body">{content.map((child) => <UiNode key={child.id} node={child} context={context} />)}</div>
      {actions.length ? <footer className="intui-panel-actions">
        {visibleActions.map((child) => <UiNode key={child.id} node={child} context={context} />)}
        {overflowActions.length ? <DeferredMenu open={moreOpen} onOpenChange={setMoreOpen} className="intui-surface-menu"
          label={i18n('session.moreActions', 'More actions')}
          trigger={<BaseButton type="button" className="intui-panel-more" aria-label={i18n('session.moreActions', 'More actions')}><Icon name="more" size={18} /></BaseButton>}>
          {({ FoundationMenuItem }) => overflowActions.map((child) => <FoundationMenuItem key={child.id}
            disabled={context.readOnly && (child.action as UiAction).type === 'prompt'}
            onClick={(event) => executeAction(child.action as UiAction, context, event)}>{asProse(resolve(child.label, context))}</FoundationMenuItem>)}
        </DeferredMenu> : null}
      </footer> : null}
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
    <ShadcnLabel className="intui-slider" data-intui-id={node.id}>
      <span className="intui-control-head">
        <span>{label}</span>
        <output>{valueText}</output>
      </span>
      <ShadcnNativeControl
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label || 'Value'}
        aria-valuetext={valueText}
        onChange={(event) => setBoundValue(context, bind, Number(event.currentTarget.value))}
      />
    </ShadcnLabel>
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
            <BaseButton
              type="button"
              variant="outline"
              size="sm"
              key={`${node.id}-${index}`}
              className={selected ? 'is-selected' : ''}
              aria-pressed={selected}
              onClick={() => setBoundValue(context, bind, optionValue)}
            >
              {optionLabel}
            </BaseButton>
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
    <div className="intui-toggle" data-intui-id={node.id}>
      <span className="intui-toggle-copy">
        {label ? <span className="intui-toggle-label">{label}</span> : null}
        {description ? <span className="intui-toggle-description">{description}</span> : null}
      </span>
      <ShadcnSwitch
        checked={checked}
        aria-label={label || 'Toggle'}
        onCheckedChange={(next) => setBoundValue(context, bind, next)}
      />
    </div>
  );
}

function UiButton({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const label = asProse(resolve(node.label, context));
  const action = isRecord(node.action) ? node.action as UiAction : null;
  if (!label || !action) return null;
  const promptDisabled = context.readOnly && action.type === 'prompt';
  return (
    <BaseButton
      type="button"
      variant={node.primary === true ? 'default' : 'outline'}
      size="desktop"
      className={`intui-button${node.primary === true ? ' is-primary' : ''}`}
      data-intui-id={node.id}
      disabled={promptDisabled}
      onClick={(event) => executeAction(action, context, event)}
    >
      {label}
    </BaseButton>
  );
}

function UiTable({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const columns = Array.isArray(node.columns) ? node.columns.slice(0, 8) : [];
  const rows = Array.isArray(node.rows) ? node.rows.slice(0, 24) : [];
  if (!columns.length) return null;
  if (!rows.length) return <div className="intui-table-wrap" data-intui-id={node.id} role="status">{i18n('common.noData', 'No data')}</div>;
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
    <div className="ds-table-wrap intui-table-wrap" data-intui-id={node.id} role="region" tabIndex={0} aria-label={caption || 'Data table'}>
      <table className="ds-table intui-table">
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
  for (const rawPoint of node.points.slice(0, 50)) {
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
  return <div className="intui-chart" data-intui-id={node.id}>
    <NativeVisualization template={node.kind === 'line' ? 'line' : 'bar'} title={title}
      streaming={context.streaming} accessibilitySummary={points.map((point) => `${point.label}: ${point.value}`).join('; ')}
      payload={{ categories: points.map((point) => point.label), series: [{ name: title || 'Values', data: points.map((point) => point.value) }] }} />
  </div>;
}

function UiVisualization({ node, context }: { node: IntelligenceUiNode; context: RenderContext }) {
  const title = asProse(resolve(node.title, context));
  const caption = asProse(resolve(node.caption, context));
  const template = typeof node.template === 'string' ? node.template : typeof node.kind === 'string' ? node.kind : 'bar';
  const payload = isRecord(node.payload) ? node.payload : isRecord(node.data) ? node.data : {};
  const accessibilitySummary = typeof node.accessibilitySummary === 'string'
    ? node.accessibilitySummary
    : typeof node.summary === 'string'
      ? node.summary
      : undefined;
  return (
    <div className="intui-chart" data-intui-id={node.id} data-template={template}>
      <NativeVisualization
        template={template}
        title={title}
        caption={caption}
        payload={payload}
        accessibilitySummary={accessibilitySummary}
        streaming={context.streaming}
      />
    </div>
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
          <BaseButton
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
          </BaseButton>
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

interface EntityPresentationProps {
  title: string;
  subtitle: string;
  description: string;
}

function EntityCopy({ title, subtitle, description }: EntityPresentationProps) {
  return <>
    <div className="intui-entity-head">
      {title ? <div className="intui-entity-title">{title}</div> : null}
      {subtitle ? <div className="intui-entity-subtitle">{subtitle}</div> : null}
    </div>
    {description ? <p className="intui-entity-description">{description}</p> : null}
  </>;
}

function EntityImage({ imageUrl, imageAlt }: { imageUrl: string | null; imageAlt: string }) {
  if (!imageUrl) return null;
  return <img className="intui-entity-image" src={imageUrl} alt={imageAlt} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} />;
}

function EntityFields({ fields, nodeId, context }: { fields: Record<string, unknown>[]; nodeId: string; context: RenderContext }) {
  if (!fields.length) return null;
  return <dl className="intui-entity-fields">
    {fields.map((field, index) => {
      const label = asProse(resolve(field.label, context));
      const value = asText(resolve(field.value, context));
      if (!label && !value) return null;
      return <div key={`${nodeId}-field-${index}`}><dt>{label}</dt><dd>{value}</dd></div>;
    })}
  </dl>;
}

function EntityAction({ action, label, disabled, context }: { action: UiAction | null; label: string; disabled: boolean; context: RenderContext }) {
  if (!action || !label) return null;
  return <BaseButton type="button" variant="outline" size="desktop" className="intui-button intui-entity-action" disabled={disabled} onClick={(event) => executeAction(action, context, event)}>{label}</BaseButton>;
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
  return <article className="intui-entity" data-intui-id={node.id}>
    <EntityImage imageUrl={imageUrl} imageAlt={imageAlt} />
    <div className="intui-entity-body">
      <EntityCopy title={title} subtitle={subtitle} description={description} />
      <EntityFields fields={fields} nodeId={node.id} context={context} />
      {renderChildren(node, context)}
      <EntityAction action={action} label={actionLabel} disabled={promptDisabled} context={context} />
    </div>
  </article>;
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

type UiNodeRenderer = (node: IntelligenceUiNode, context: RenderContext) => ReactNode;

const nodeRenderers = new Map<string, UiNodeRenderer>([
  ['learning', (node, context) => <LazyLearningNode node={node} readOnly={context.readOnly} streaming={context.streaming} />],
  ['visualization', (node, context) => <UiVisualization node={node} context={context} />],
  ['demonstration', (node, context) => <Demonstration program={node.program} title={asProse(resolve(node.title, context))} streaming={context.streaming} />],
  ['physics', (node, context) => typeof node.scene === 'string' ? <PhysicsLab scene={node.scene} title={asProse(resolve(node.title, context))} parameters={isRecord(node.parameters) ? node.parameters : { separation: node.separation, wavelength: node.wavelength, aperture: node.aperture }} /> : null],
  ['openui', (node, context) => typeof node.source === 'string' ? <LazyOpenUiBlock source={node.source} readOnly={context.readOnly} open={context.streaming} embedded /> : null],
  ['panel', (node, context) => <UiPanel node={node} context={context} />],
  ['stack', (node, context) => <UiStack node={node} context={context} />],
  ['grid', (node, context) => <UiGrid node={node} context={context} />],
  ['text', (node, context) => <UiText node={node} context={context} />],
  ['metric', (node, context) => <UiMetric node={node} context={context} />],
  ['progress', (node, context) => <UiProgress node={node} context={context} />],
  ['divider', (node) => <ShadcnSeparator className="intui-divider" data-intui-id={node.id} />],
  ['callout', (node, context) => <UiCallout node={node} context={context} />],
  ['slider', (node, context) => <UiSlider node={node} context={context} />],
  ['choice', (node, context) => <UiChoice node={node} context={context} />],
  ['toggle', (node, context) => <UiToggle node={node} context={context} />],
  ['button', (node, context) => <UiButton node={node} context={context} />],
  ['table', (node, context) => <UiTable node={node} context={context} />],
  ['chart', (node, context) => <UiChart node={node} context={context} />],
  ['tabs', (node, context) => <UiTabs node={node} context={context} />],
  ['entity', (node, context) => <UiEntity node={node} context={context} />],
  ['image-gallery', (node, context) => <UiImageGallery node={node} context={context} />],
]);

export function UiNode({ node, context }: { node: IntelligenceUiNode; context: RenderContext }): ReactNode {
  if (!resolveVisible(node, context)) return null;
  const issues = intelligentUiControlIssues(node);
  if (issues.length && !context.streaming) return <div className="intui-callout" data-intui-failure={node.id} role="status">
    {i18n('tool.uiInvalid', 'Component could not be displayed.')}
    <details><summary>{i18n('common.details', 'Details')}</summary>{issues.map(issue => <p key={issue.path}>{issue.path}: {issue.message}</p>)}</details>
  </div>;
  const renderer = nodeRenderers.get(node.type);
  if (!renderer) {
    if (!context.streaming) {
      return (
        <div className="intui-callout" data-intui-failure={node.id} role="status">
          {i18n('tool.uiInvalid', 'Component could not be displayed.')}
          <details><summary>{i18n('common.details', 'Details')}</summary><p>Unsupported node type "{String(node.type)}".</p></details>
        </div>
      );
    }
    return null;
  }
  const rendered = renderer(node, context);
  if (!rendered && !context.streaming) {
    return (
      <div className="intui-callout" data-intui-failure={node.id} role="status">
        {i18n('tool.uiInvalid', 'Component could not be displayed.')}
        <details><summary>{i18n('common.details', 'Details')}</summary><p>Component "{node.id}" ({node.type}) failed to render or has missing required attributes.</p></details>
      </div>
    );
  }
  return rendered;
}
