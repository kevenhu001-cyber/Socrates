import { InputGroup, InputGroupInput, InputGroupAddon } from '../ui/shadcn/input-group';
import { Button } from '../ui/shadcn/button';
import { DialogHeader, DialogTitle, DialogClose } from '../ui/shadcn/dialog';
import { SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from 'cn';
import type { SettingsLabel, SettingsSection } from './settings.types';

export function SettingsHeader({
  label,
}: {
  label: SettingsLabel;
}) {
  return (
    <DialogHeader className="settings-header flex-row items-center justify-between">
      <DialogTitle id="settingsTitle">{label('设置', 'Settings')}</DialogTitle>
      <DialogClose render={
        <Button
          variant="ghost" size="icon"
          id="settingsCloseBtn"
          aria-label={label('关闭', 'Close')}
          data-i18n-aria="common.close"
          data-initial-focus="true"
        />
      }>
        <XIcon data-icon="inline-start" aria-hidden />
      </DialogClose>
    </DialogHeader>
  );
}

export function SettingsNavigation({
  categories,
  label,
  query,
  section,
  open,
  onQueryChange,
  onSectionChange,
}: {
  categories: Array<[SettingsSection, string]>;
  label: SettingsLabel;
  query: string;
  section: SettingsSection;
  open: boolean;
  onQueryChange: (query: string) => void;
  onSectionChange: (section: SettingsSection) => void;
}) {
  const navRef = useRef<HTMLElement | null>(null);

  /* On a phone the rail is a horizontal strip eight categories wide, so the
     restored section can open off-screen — the modal remembers the last tab
     but the strip does not remember the scroll offset. Centre the active tab
     when the sheet opens (the pane stays mounted while closed, so the section
     alone would not re-run the effect). Desktop never overflows horizontally
     and bails out, because there `scrollIntoView` would nudge the pane. */
  useEffect(() => {
    if (!open) return;
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    nav.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [open, section, query]);

  return (
    <aside className="settings-nav" aria-label={label('设置分类', 'Settings categories')} ref={navRef}>
      <InputGroup className="settings-search mb-3 shrink-0">
        <InputGroupInput
          type="search"
          placeholder={label('搜索设置', 'Search settings')}
          aria-label={label('搜索设置', 'Search settings')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <InputGroupAddon><SearchIcon aria-hidden /></InputGroupAddon>
      </InputGroup>
      {categories
        .filter(([, name]) => name.toLowerCase().includes(query.toLowerCase()))
        .map(([key, name]) => (
          <Button
            variant={section === key ? 'secondary' : 'ghost'}
            key={key}
            data-section={key}
            className={cn('justify-start', section === key && 'active')}
            aria-current={section === key ? 'page' : undefined}
            onClick={() => onSectionChange(key)}
          >{name}</Button>
        ))}
    </aside>
  );
}
