import type { ReasoningEffort, ResponseSpeed } from '../../config/chatPreferences';
import type { ChatProviderOption } from './types';
import { i18n } from '../legacy/gateway.ts';

const EFFORT_STOPS: ReasoningEffort[] = ['low', 'medium', 'high'];

export function effortLabel(value: ReasoningEffort): string {
  return i18n(`effort.${value}`, value);
}

export function speedLabel(value: ResponseSpeed): string {
  return i18n(`chatconfig.speed.${value}`, value === 'fast' ? 'Fast' : 'Standard');
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>;
}

function providerName(provider: ChatProviderOption): string {
  return provider.label && provider.label !== 'Default'
    ? provider.label
    : provider.model || provider.label || i18n('chatconfig.model', 'Model');
}

interface ModelPickerPanelProps {
  providers: ReadonlyArray<ChatProviderOption>;
  activeId: string;
  effort: ReasoningEffort;
  speed: ResponseSpeed;
  onPickModel: (id: string) => void;
  onOpenEffort: () => void;
  onOpenSpeed: () => void;
  onOpenSettings: () => void;
}

export function ModelPickerPanel({ providers, activeId, effort, speed, onPickModel, onOpenEffort, onOpenSpeed, onOpenSettings }: ModelPickerPanelProps) {
  return (
    <>
      <div role="listbox" aria-label={i18n('chatconfig.models', 'Models')}>
        {providers.length ? providers.map((provider, index) => (
          <button key={provider.id} type="button" className="chat-config-row" role="option" aria-selected={activeId === provider.id} data-initial-focus={index === 0 ? 'true' : undefined} onClick={() => onPickModel(provider.id)}>
            <span>
              <strong>{providerName(provider)}</strong>
              {provider.model && provider.model !== providerName(provider) ? <small>{provider.model}</small> : null}
            </span>
            {activeId === provider.id ? <CheckIcon /> : null}
          </button>
        )) : <div className="chat-config-empty">{i18n('chatconfig.noModels', 'No models yet.')}</div>}
      </div>
      <div className="chat-config-divider" />
      <button type="button" className="chat-config-row" onClick={onOpenEffort}>
        <span><strong>{i18n('chatconfig.effort', 'Reasoning effort')}</strong></span>
        <span className="chat-config-value">{effortLabel(effort)}<ChevronIcon /></span>
      </button>
      <button type="button" className="chat-config-row" onClick={onOpenSpeed}>
        <span><strong>{i18n('chatconfig.speed', 'Speed')}</strong></span>
        <span className="chat-config-value">{speedLabel(speed)}<ChevronIcon /></span>
      </button>
      <button type="button" className="chat-config-row" onClick={onOpenSettings}>
        <span><strong>{i18n('chatconfig.manageModels', 'Manage models')}</strong></span>
      </button>
    </>
  );
}

interface EffortPanelProps {
  effort: ReasoningEffort;
  speed: ResponseSpeed;
  onBack: () => void;
  onCommit: (effort: ReasoningEffort, speed: ResponseSpeed) => void;
}

export function EffortPanel({ effort, speed, onBack, onCommit }: EffortPanelProps) {
  const sliderIndex = EFFORT_STOPS.indexOf(effort);
  return (
    <>
      <button type="button" className="chat-config-row" data-initial-focus="true" onClick={onBack}>
        <span><strong>{effortLabel(effort)}</strong></span>
        <span className="chat-config-value"><ChevronIcon /></span>
      </button>
      <div className="chat-config-slider">
        <input
          type="range"
          min={0}
          max={EFFORT_STOPS.length - 1}
          step={1}
          value={sliderIndex < 0 ? 1 : sliderIndex}
          aria-label={i18n('chatconfig.effort', 'Reasoning effort')}
          onChange={(event) => onCommit(EFFORT_STOPS[Number(event.target.value)], speed)}
        />
        <div className="chat-config-slider-dots" aria-hidden="true"><span /><span /><span /></div>
      </div>
    </>
  );
}

interface SpeedPanelProps {
  effort: ReasoningEffort;
  speed: ResponseSpeed;
  onCommit: (effort: ReasoningEffort, speed: ResponseSpeed) => void;
}

export function SpeedPanel({ effort, speed, onCommit }: SpeedPanelProps) {
  return (
    <div role="listbox" aria-label={i18n('chatconfig.speed', 'Speed')}>
      <button type="button" className="chat-config-row" role="option" aria-selected={speed === 'standard'} data-initial-focus="true" onClick={() => onCommit(effort, 'standard')}>
        <span>
          <strong>{speedLabel('standard')}</strong>
          <small>{i18n('chatconfig.speed.standardHint', 'Works with every configured model')}</small>
        </span>
        {speed === 'standard' ? <CheckIcon /> : null}
      </button>
      <button type="button" className="chat-config-row" role="option" aria-selected={speed === 'fast'} onClick={() => onCommit(effort, 'fast')}>
        <span>
          <strong>{speedLabel('fast')}</strong>
          <small>{i18n('chatconfig.speed.fastHint', 'Prefers low-latency service; falls back automatically')}</small>
        </span>
        {speed === 'fast' ? <CheckIcon /> : null}
      </button>
    </div>
  );
}
