import { MathText } from '../../rn/useInlineMath';
import { Button as UiButton } from '../../ui/Button';
import { defineComponent } from '@openuidev/react-lang';
import { useId, useState } from 'react';
import { z } from 'zod/v4';
import { children, color, cx, fg, webUrl } from './style';

export const Title = defineComponent({
  name: 'Title',
  props: z.object({
    text: z.string(),
    size: z.enum(['sm', 'md', 'lg', 'xl', '2xl', '3xl']).optional(),
    color: color.optional(),
  }),
  description: 'Compact heading at body size; use weight to distinguish results.',
  component: ({ props }) => (
    <div
      role="heading"
      aria-level={3}
      className={cx('iui-title', `iui-title-${props.size ?? 'md'}`)}
      style={{ color: fg(props.color) }}
    >
      <MathText text={props.text} />
    </div>
  ),
});
export const Text = defineComponent({
  name: 'Text',
  props: z.object({
    text: z.string(),
    size: z.enum(['xs', 'sm', 'md', 'lg']).optional(),
    color: color.optional(),
    weight: z.enum(['normal', 'medium', 'semibold']).optional(),
  }),
  description: 'Plain text paragraph. Use expressions for live results.',
  component: ({ props }) => (
    <p
      className={cx(
        'iui-text',
        `iui-text-${props.size ?? 'md'}`,
        `iui-weight-${props.weight ?? 'normal'}`,
      )}
      style={{ color: fg(props.color) }}
    >
      <MathText text={props.text} />
    </p>
  ),
});
export const Caption = defineComponent({
  name: 'Caption',
  props: z.object({ text: z.string() }),
  description: 'Small secondary text.',
  component: ({ props }) => (
    <p className="iui-caption">
      <MathText text={props.text} />
    </p>
  ),
});
export const Label = defineComponent({
  name: 'Label',
  props: z.object({ text: z.string() }),
  description: 'Field or group label.',
  component: ({ props }) => (
    <span className="iui-label">
      <MathText text={props.text} />
    </span>
  ),
});
export const Badge = defineComponent({
  name: 'Badge',
  props: z.object({
    text: z.string(),
    color: z.enum(['neutral', 'info', 'success', 'warning', 'danger', 'purple', 'pink']).optional(),
  }),
  description: 'Short status label.',
  component: ({ props }) => (
    <span className="iui-badge" style={{ color: fg(props.color) }}>
      <MathText text={props.text} />
    </span>
  ),
});
export const Link = defineComponent({
  name: 'Link',
  props: z.object({ text: z.string(), url: z.string() }),
  description: 'Opens a web URL.',
  component: ({ props }) => {
    const href = webUrl(props.url);
    return href ? (
      <a className="iui-link" href={href} target="_blank" rel="noopener noreferrer">
        <MathText text={props.text} />
      </a>
    ) : (
      <span>
        <MathText text={props.text} />
      </span>
    );
  },
});
export const Image = defineComponent({
  name: 'Image',
  props: z.object({ src: z.string(), alt: z.string(), caption: z.string().optional() }),
  description: 'Image from a known web URL. Never invent image URLs.',
  component: ({ props }) => {
    const src = webUrl(props.src);
    return src ? (
      <figure className="iui-image">
        <img
          src={src}
          alt={props.alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
        {props.caption ? (
          <figcaption>
            <MathText text={props.caption ?? ''} />
          </figcaption>
        ) : null}
      </figure>
    ) : null;
  },
});
export const Carousel = defineComponent({
  name: 'Carousel',
  props: z.object({ children }),
  description: 'Horizontally scrolling cards.',
  component: ({ props, renderNode }) => (
    <div className="iui-carousel">{renderNode(props.children)}</div>
  ),
});
export const Flashcard = defineComponent({
  name: 'Flashcard',
  props: z.object({ front: z.string(), back: z.string(), label: z.string().optional() }),
  description: 'A study card that flips on click.',
  component: function FlashcardView({ props }) {
    const [flipped, setFlipped] = useState(false);
    const faceId = useId();
    return (
      <UiButton
        className="iui-flashcard"
        type="button"
        aria-label={props.label ?? props.front}
        aria-describedby={flipped || props.label ? faceId : undefined}
        aria-pressed={flipped}
        onClick={() => setFlipped((value) => !value)}
      >
        {props.label ? (
          <span className="iui-caption">
            <MathText text={props.label} />
          </span>
        ) : null}
        <span id={faceId}>
          <MathText text={flipped ? props.back : props.front} />
        </span>
      </UiButton>
    );
  },
});
const tableCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function tableCell(row: Record<string, unknown>, key: string) {
  const value = row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return typeof value === 'string' || typeof value === 'boolean' ? value : null;
}

export const Table = defineComponent({
  name: 'Table',
  props: z.object({
    columns: z.array(z.object({ key: z.string(), label: z.string() })),
    rows: z.array(z.record(z.string(), z.unknown())),
    caption: z.string().optional(),
    sortable: z.boolean().optional(),
  }),
  description:
    'Data table. columns are {key,label}; rows use those keys. Set sortable=true to let readers reorder by any column. Only the first 100 supplied rows are shown and sortable.',
  component: function TableView({ props }) {
    const [sort, setSort] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(
      null,
    );
    const columns = (props.columns ?? []).slice(0, 12);
    const activeSort = props.sortable && columns.some((col) => col.key === sort?.key) ? sort : null;
    const rows = (props.rows ?? []).slice(0, 100).map((row, index) => ({ row, index }));
    if (activeSort) {
      const direction = activeSort.direction === 'ascending' ? 1 : -1;
      rows.sort((a, b) => {
        const left = tableCell(a.row, activeSort.key);
        const right = tableCell(b.row, activeSort.key);
        if (left === null || right === null)
          return (left === null ? 1 : 0) - (right === null ? 1 : 0);
        if (typeof left === 'number' && typeof right !== 'number') return -1;
        if (typeof right === 'number' && typeof left !== 'number') return 1;
        const order =
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : tableCollator.compare(String(left), String(right));
        return order * direction;
      });
    }
    return (
      <div
        className="ds-table-wrap iui-table-wrap"
        role="region"
        tabIndex={0}
        aria-label={props.caption || 'Data table'}
      >
        <table className="ds-table iui-table">
          {props.caption ? (
            <caption>
              <MathText text={props.caption ?? ''} />
            </caption>
          ) : null}
          <thead>
            <tr>
              {columns.map((col) => {
                const direction = activeSort?.key === col.key ? activeSort.direction : undefined;
                return (
                  <th scope="col" key={col.key} aria-sort={direction}>
                    {props.sortable ? (
                      <UiButton
                        className="iui-table-sort"
                        onClick={() =>
                          setSort({
                            key: col.key,
                            direction: direction === 'ascending' ? 'descending' : 'ascending',
                          })
                        }
                      >
                        <MathText text={col.label} />
                        <span aria-hidden>
                          {direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}
                        </span>
                      </UiButton>
                    ) : (
                      <MathText text={col.label} />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, index }) => (
              <tr key={index}>
                {columns.map((col) => (
                  <td key={col.key}>
                    <MathText text={String(tableCell(row, col.key) ?? '')} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
});
