import { Button } from '../ui/shadcn/button';

export interface PickerProviderItem {
  id: string;
  label?: string;
  model?: string;
  url?: string;
  isBuiltIn?: boolean;
  glyph: string;
}

export interface PickerExtensionItem {
  key: string;
  name: string;
  icon?: string;
  on: boolean;
}

interface PickerMenuProps {
  mode: 'loading' | 'models' | 'extensions';
  providers?: PickerProviderItem[];
  extensions?: PickerExtensionItem[];
  activeId?: string;
  addLabel?: string;
}

function AddModelOption({ label }: { label: string }) {
  return (
    <Button type="button" variant="ghost" className="model-picker-add">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
        <circle cx="12" cy="12" r="5" opacity="0.25" />
        <path d="M12 8v8M8 12h8" />
      </svg>
      {label}
    </Button>
  );
}

function ProviderOption({ provider, activeId }: { provider: PickerProviderItem; activeId?: string }) {
  const isActive = provider.id === activeId;
  const displayName = provider.label && provider.label !== 'Default'
    ? provider.label
    : (provider.model || provider.label || 'Model');
  const sub = provider.isBuiltIn ? '' : (provider.model || '');
  const subLine = sub && sub !== displayName ? sub : (provider.isBuiltIn ? '' : (provider.url || ''));
  return (
    <Button
      type="button"
      variant="ghost"
      className={`model-picker-item${isActive ? ' active' : ''}`}
      data-id={provider.id}
      role="option"
      aria-selected={isActive}
    >
      <span className="model-picker-item-glyph" dangerouslySetInnerHTML={{ __html: provider.glyph }} />
      <span className="model-picker-item-main">
        <span className="model-picker-item-name">{displayName}</span>
        {subLine ? <span className="model-picker-item-sub">{subLine}</span> : null}
      </span>
      <svg className="model-picker-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" />
        <circle cx="20" cy="5" r="1.2" opacity="0.4" />
      </svg>
    </Button>
  );
}

function ExtensionOption({ extension }: { extension: PickerExtensionItem }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={`extensions-item${extension.on ? ' on' : ''}`}
      data-ext={extension.key}
      role="option"
      aria-selected={extension.on}
    >
      <span className="extensions-item-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
          <circle cx="20" cy="5" r="1.2" opacity="0.4" />
        </svg>
      </span>
      <span className="extensions-item-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: extension.icon || '' }} />
      <span className="extensions-item-main"><span className="extensions-item-name">{extension.name}</span></span>
    </Button>
  );
}

export function PickerMenu({ mode, providers = [], extensions = [], activeId, addLabel }: PickerMenuProps) {
  if (mode === 'loading') return <div className="model-picker-empty" style={{ opacity: 0.5 }}>Loading…</div>;
  if (mode === 'extensions') return <>{extensions.map((extension) => <ExtensionOption key={extension.key} extension={extension} />)}</>;

  const sorted = providers.slice().sort((a, b) => Number(Boolean(b.isBuiltIn)) - Number(Boolean(a.isBuiltIn)));
  return <>
    {sorted.length
      ? <>{sorted.map((provider) => <ProviderOption key={provider.id} provider={provider} activeId={activeId} />)}<div className="model-picker-divider" /></>
      : <div className="model-picker-empty">No models yet. Open Settings to add one.</div>}
    <AddModelOption label={addLabel || (providers.length ? 'Manage models…' : 'Add a model…')} />
  </>;
}
