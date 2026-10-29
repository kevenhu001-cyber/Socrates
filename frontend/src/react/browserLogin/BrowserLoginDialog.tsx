import { useEffect, useRef } from 'react';
import { Button, buttonVariants } from '../ui/shadcn/button';
import { cn } from 'cn';

export interface BrowserLoginDialogProps {
  mode: 'fallback' | 'handoff';
  title?: string;
  description?: string;
  status?: string;
  consentDisabled?: boolean;
  consentHidden?: boolean;
  linkUrl?: string | null;
  onConsent?: () => void;
  onCancel: () => void;
  onLinkClick?: () => void;
}

export function BrowserLoginDialog(props: BrowserLoginDialogProps) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (props.linkUrl) linkRef.current?.focus();
  }, [props.linkUrl]);

  useEffect(() => {
    if (linkRef.current) linkRef.current.referrerPolicy = 'no-referrer';
  }, [props.linkUrl]);

  if (props.mode === 'fallback') {
    return (
      <div className="flex flex-col gap-3">
        <p className="mb-0">{props.description}</p>
        <Button type="button" variant="outline" size="touch" onClick={props.onCancel}>关闭</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 id="androidLoginHandoffTitle">{props.title}</h2>
      <p>{props.description}</p>
      <p role="status" aria-live="polite">{props.status}</p>
      <Button type="button" variant="default" size="touch" hidden={props.consentHidden} disabled={props.consentDisabled} onClick={props.onConsent}>
        确认此账号并继续
      </Button>
      <a
        ref={linkRef}
        className={cn(buttonVariants({ variant: 'default', size: 'touch' }), 'browser-login-handoff-link')}
        href={props.linkUrl || undefined}
        hidden={!props.linkUrl}
        rel="noreferrer"
        referrerPolicy="no-referrer"
        onClick={props.onLinkClick}
      >
        返回 Socrates Android
      </a>
      <Button type="button" variant="outline" size="touch" onClick={props.onCancel}>取消</Button>
    </div>
  );
}
