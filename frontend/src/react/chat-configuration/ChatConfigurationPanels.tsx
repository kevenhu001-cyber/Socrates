import type { CSSProperties } from 'react';
import { Icon } from '../../legacy/Icon';
import { NativeControl as ShadcnNativeControl } from '../ui/NativeControl';
import { Button as UiButton } from '../ui/Button';
import type { ReasoningEffort, ResponseSpeed } from '../../config/chatPreferences';
import type { ChatProviderOption } from './types';
import { i18n } from '../../ui/legacyI18n.ts';

const EFFORT_STOPS: ReasoningEffort[] = ['instant', 'low', 'medium', 'high'];

export function effortLabel(value: ReasoningEffort): string {
  return i18n(`effort.${value}`, value);
}

export function speedLabel(value: ResponseSpeed): string {
  return i18n(`chatconfig.speed.${value}`, value === 'fast' ? 'Fast' : 'Standard');
}

function providerName(provider: ChatProviderOption): string {
  return provider.label && provider.label !== 'Default'
    ? provider.label
    : provider.model || provider.label || i18n('chatconfig.model', 'Model');
}

/* A short, capability-derived line under the model name — the picker should
   describe what the model does, not print the provider's technical model id.
   Absent capabilities mean "nothing is known", so the row stays single-line. */
function providerHint(provider: ChatProviderOption): string {
  const capabilities = provider.capabilities;
  if (!capabilities) return '';
  if (capabilities.isReasoning) {
    return capabilities.supportsInstant
      ? i18n('chatconfig.modelHint.reasoningInstant', 'Reasons, or answers instantly')
      : i18n('chatconfig.modelHint.reasoning', 'Thinks before answering');
  }
  if (capabilities.supportsEffort) {
    return i18n('chatconfig.modelHint.effort', 'Adjustable reasoning effort');
  }
  return i18n('chatconfig.modelHint.standard', 'Answers directly');
}

function BackToModels({
  label,
  onBack,
  initialFocus,
}: {
  label: string;
  onBack: () => void;
  initialFocus?: boolean;
}) {
  return (
    <UiButton
      type="button"
      className="chat-config-row chat-config-back press-tint"
      data-initial-focus={initialFocus}
      aria-label={`${i18n('chatconfig.backToModels', 'Back to model list')} · ${label}`}
      onClick={onBack}
    >
      <Icon name="chevronLeft" size={18} />
      <strong className="chat-config-back-label">{label}</strong>
    </UiButton>
  );
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

export function ModelPickerPanel({
  providers,
  activeId,
  effort,
  speed,
  onPickModel,
  onOpenEffort,
  onOpenSpeed,
  onOpenSettings,
}: ModelPickerPanelProps) {
  return (
    <>
      <div className="chat-config-section-label">{i18n('chatconfig.models', 'Models')}</div>
      <div role="listbox" aria-label={i18n('chatconfig.models', 'Models')}>
        {providers.length ? (
          providers.map((provider, index) => {
            const name = providerName(provider);
            const hint = providerHint(provider);
            return (
              <UiButton
                key={provider.id}
                type="button"
                className="chat-config-row chat-config-model-row press-tint"
                role="option"
                aria-selected={activeId === provider.id}
                aria-label={hint ? `${name}. ${hint}` : name}
                data-initial-focus={
                  activeId === provider.id ||
                  (index === 0 && !providers.some((p) => p.id === activeId))
                    ? 'true'
                    : undefined
                }
                onClick={() => onPickModel(provider.id)}
              >
                <span className="chat-config-model-copy">
                  <strong>{name}</strong>
                  {hint ? <small>{hint}</small> : null}
                </span>
                {activeId === provider.id ? (
                  <Icon name="check" size={18} className="chat-config-check" />
                ) : null}
              </UiButton>
            );
          })
        ) : (
          <div className="chat-config-empty">{i18n('chatconfig.noModels', 'No models yet.')}</div>
        )}
      </div>
      <div className="chat-config-divider" />
      <UiButton
        type="button"
        className="chat-config-row chat-config-action-row press-tint"
        onClick={onOpenEffort}
      >
        <span className="chat-config-row-lead" aria-hidden="true">
          <Icon name="sliders" size={18} />
        </span>
        <span className="chat-config-row-copy">
          <strong>{i18n('chatconfig.effort', 'Reasoning effort')}</strong>
        </span>
        <span className="chat-config-value">
          {effortLabel(effort)}
          <Icon name="chevronRight" size={16} />
        </span>
      </UiButton>
      <UiButton
        type="button"
        className="chat-config-row chat-config-action-row press-tint"
        onClick={onOpenSpeed}
      >
        <span className="chat-config-row-lead" aria-hidden="true">
          <Icon name="clock" size={18} />
        </span>
        <span className="chat-config-row-copy">
          <strong>{i18n('chatconfig.speed', 'Speed')}</strong>
        </span>
        <span className="chat-config-value">
          {speedLabel(speed)}
          <Icon name="chevronRight" size={16} />
        </span>
      </UiButton>
      <div className="chat-config-divider" />
      <UiButton
        type="button"
        className="chat-config-row chat-config-action-row press-tint"
        onClick={onOpenSettings}
      >
        <span className="chat-config-row-lead" aria-hidden="true">
          <Icon name="gear" size={18} />
        </span>
        <span className="chat-config-row-copy">
          <strong>{i18n('chatconfig.manageModels', 'Manage models')}</strong>
        </span>
        <Icon name="chevronRight" size={16} className="chat-config-action-chevron" />
      </UiButton>
    </>
  );
}

interface EffortPanelProps {
  effort: ReasoningEffort;
  speed: ResponseSpeed;
  /** False when the active model cannot switch thinking off. */
  supportsInstant?: boolean;
  onBack: () => void;
  onCommit: (effort: ReasoningEffort, speed: ResponseSpeed) => void;
}

export function EffortPanel({
  effort,
  speed,
  supportsInstant = true,
  onBack,
  onCommit,
}: EffortPanelProps) {
  /* a model that cannot switch thinking off
     has no Instant stop. Offering it would promise a mode the server
     rejects with a capability error. */
  const stops = supportsInstant ? EFFORT_STOPS : EFFORT_STOPS.filter((stop) => stop !== 'instant');
  const sliderIndex = stops.indexOf(effort);
  return (
    <>
      <BackToModels label={effortLabel(effort)} onBack={onBack} initialFocus />
      <UiButton
        type="button"
        className="chat-config-row press-tint"
        aria-pressed={effort === 'instant'}
        disabled={!supportsInstant}
        onClick={() => onCommit('instant', speed)}
      >
        <span className="chat-config-row-copy">
          <strong>{i18n('effort.instant', 'Instant')}</strong>
          <small>
            {supportsInstant
              ? i18n('chatconfig.instantHint', 'Answer directly without thinking')
              : i18n('chatconfig.instantUnsupported', 'This model always reasons')}
          </small>
        </span>
        {effort === 'instant' ? <Icon name="check" size={18} /> : null}
      </UiButton>
      <div
        className="chat-config-slider"
        style={
          {
            '--chat-config-fill': `${stops.length > 1 ? (Math.max(0, sliderIndex < 0 ? 1 : sliderIndex) / (stops.length - 1)) * 100 : 0}%`,
          } as CSSProperties
        }
      >
        <ShadcnNativeControl
          type="range"
          min={0}
          max={stops.length - 1}
          step={1}
          value={sliderIndex < 0 ? 1 : sliderIndex}
          aria-label={i18n('chatconfig.effort', 'Reasoning effort')}
          aria-valuetext={effortLabel(effort)}
          onChange={(event) => onCommit(stops[Number(event.target.value)], speed)}
        />
        <div className="chat-config-slider-dots" aria-hidden="true">
          {stops.map((stop, index) => (
            <span
              key={stop}
              data-active={index === (sliderIndex < 0 ? 1 : sliderIndex) || undefined}
            />
          ))}
        </div>
      </div>
    </>
  );
}

interface SpeedPanelProps {
  effort: ReasoningEffort;
  speed: ResponseSpeed;
  onBack: () => void;
  onCommit: (effort: ReasoningEffort, speed: ResponseSpeed) => void;
}

const SPEED_OPTIONS: ResponseSpeed[] = ['standard', 'fast'];

export function SpeedPanel({ effort, speed, onBack, onCommit }: SpeedPanelProps) {
  const title = i18n('chatconfig.speed', 'Speed');
  return (
    <>
      <BackToModels label={title} onBack={onBack} />
      <div role="listbox" aria-label={title}>
        {SPEED_OPTIONS.map((option) => (
          <UiButton
            key={option}
            type="button"
            className="chat-config-row press-tint"
            role="option"
            aria-selected={speed === option}
            data-initial-focus={speed === option || undefined}
            onClick={() => onCommit(effort, option)}
          >
            <span className="chat-config-row-copy">
              <strong>{speedLabel(option)}</strong>
              <small>
                {option === 'standard'
                  ? i18n('chatconfig.speed.standardHint', 'Works with every configured model')
                  : i18n(
                      'chatconfig.speed.fastHint',
                      'Prefers low-latency service; falls back automatically',
                    )}
              </small>
            </span>
            {speed === option ? <Icon name="check" size={18} /> : null}
          </UiButton>
        ))}
      </div>
    </>
  );
}
