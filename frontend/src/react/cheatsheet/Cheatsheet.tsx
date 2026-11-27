import { X } from 'lucide-react';
import { Button } from '../ui/shadcn/button';
import { useEffect, useReducer, useRef } from 'react';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { ensureBodyContainer } from '../lib/boot/mountContainer';
import {
  FoundationDialog,
  FoundationDialogClose,
  FoundationDialogTitle,
} from '../dialog/FoundationDialog';
import {
  installCheatsheetBridge,
  useCheatsheetDispatch,
  useCheatsheetSnapshot,
} from './cheatsheet.bridge';

function isZhLocale(): boolean {
  return typeof document !== 'undefined' && (document.documentElement.lang || '').startsWith('zh');
}

function CheatsheetSection({ title, rows }: { title: string; rows: Array<[string, string[]]> }) {
  return (
    <div className="cheatsheet-section">
      <div className="cmd-k-section-label">{title}</div>
      {rows.map(([desc, keys], i) => (
        <div className="cheatsheet-row" key={i}>
          <span className="cheatsheet-desc ml-0">{desc}</span>
          <span className="ml-auto inline-flex items-center gap-1">
            {keys.map((k, j) => (
              <kbd className="cheatsheet-kbd" key={j}>
                {k}
              </kbd>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function getSections(zh: boolean): Array<[string, Array<[string, string[]]>]> {
  const label = (z: string, e: string) => (zh ? z : e);
  return [
    [
      label('导航', 'Navigation'),
      [
        [label('打开搜索', 'Open search'), ['⌘', 'K']],
        [label('快捷键说明', 'Keyboard shortcuts'), ['⌘', '/']],
        [label('切换侧边栏', 'Toggle sidebar'), ['⌘', 'B']],
        [label('切换侧边栏（备用）', 'Toggle sidebar (alt)'), ['Ctrl', '\\']],
        [label('打开设置', 'Open settings'), ['⌘', ',']],
        [label('打开个人资料', 'Open profile'), ['⌘', '.']],
        [label('新建对话', 'New chat'), ['⌘', '⇧', 'O']],
        [label('切换项目', 'Cycle project'), ['⌘', '⇧', 'P']],
      ],
    ],
    [
      label('分享与搜索', 'Sharing & search'),
      [
        [label('复制最新回复', 'Copy last response'), ['⌘', '⇧', 'C']],
        [label('分享当前对话', 'Share current chat'), ['⌘', '⇧', 'S']],
        [label('打开项目选择', 'Open project picker'), ['⌘', '⇧', 'A']],
        [label('在对话中查找', 'Find in conversation'), ['⌘', 'F']],
      ],
    ],
    [
      label('快捷开关', 'Toggles'),
      [
        [label('切换明暗主题', 'Toggle theme'), ['⌘', '⇧', 'T']],
        [label('切换联网搜索', 'Toggle web search'), ['⌘', '⇧', 'F']],
        [label('切换思考过程', 'Toggle thinking pill'), ['⌘', '⇧', 'M']],
      ],
    ],
    [
      label('输入与发送', 'Composing'),
      [
        [label('发送消息（备用）', 'Send (alternative)'), ['⌘', '⏎']],
        [label('编辑上一条提问', 'Edit last prompt'), ['↑', label('（空输入框）', '(empty input)')]],
        [label('换行', 'New line'), ['⇧', '⏎']],
      ],
    ],
    [label('通用', 'General'), [[label('关闭弹窗', 'Close dialog'), ['Esc']]]],
  ];
}

function Cheatsheet() {
  const snap = useCheatsheetSnapshot();
  const dispatch = useCheatsheetDispatch();
  const titleRef = useRef<HTMLDivElement>(null);
  const [, refreshLang] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLang);
    return () => document.removeEventListener('socrates:langchange', refreshLang);
  }, []);

  const zh = isZhLocale();
  const sections = getSections(zh);

  return (
    <FoundationDialog
      id="cheatsheetOverlay"
      open={snap.open}
      onOpenChange={(open) => {
        if (!open) dispatch.close();
      }}
      overlayClassName="cmd-k-overlay"
      className="cmd-k-modal cheatsheet"
      initialFocus={titleRef}
    >
      <div className="modal-head">
        <FoundationDialogTitle ref={titleRef} tabIndex={-1} className="modal-title">
          {zh ? '快捷键' : 'Keyboard shortcuts'}
        </FoundationDialogTitle>
        <FoundationDialogClose
          render={<Button variant="ghost" size="icon-sm" />}
          className="modal-close"
          onClick={() => dispatch.close()}
          aria-label={zh ? '关闭' : 'Close'}
        >
          <X aria-hidden="true" />
        </FoundationDialogClose>
      </div>
      <div className="cheatsheet-body">
        {sections.map(([title, rows]) => (
          <CheatsheetSection key={title} title={title} rows={rows} />
        ))}
      </div>
    </FoundationDialog>
  );
}

const rootSlot = createRootSlot('cheatsheet');

export function mountCheatsheet(): void {
  const container = ensureBodyContainer('cheatsheetReactRoot');
  rootSlot.mount(container, <Cheatsheet />, installCheatsheetBridge);
}

export function unmountCheatsheet(): void {
  rootSlot.destroy();
}
