import { Button as UiButton } from '../../ui/Button';
import { defineComponent } from '@openuidev/react-lang';
import { useState } from 'react';
import { z } from 'zod/v4';
import { children, color, cx, fg, webUrl } from './style';

export const Title = defineComponent({
  name: 'Title',
  props: z.object({ text: z.string(), size: z.enum(['sm', 'md', 'lg', 'xl', '2xl', '3xl']).optional(), color: color.optional() }),
  description: 'Heading; use 2xl for a computed result.',
  component: ({ props }) => <div role="heading" aria-level={3} className={cx('iui-title', `iui-title-${props.size ?? 'md'}`)} style={{ color: fg(props.color) }}>{props.text}</div>,
});
export const Text = defineComponent({
  name: 'Text',
  props: z.object({ text: z.string(), size: z.enum(['xs', 'sm', 'md', 'lg']).optional(), color: color.optional(), weight: z.enum(['normal', 'medium', 'semibold']).optional() }),
  description: 'Plain text paragraph. Use expressions for live results.',
  component: ({ props }) => <p className={cx('iui-text', `iui-text-${props.size ?? 'md'}`, `iui-weight-${props.weight ?? 'normal'}`)} style={{ color: fg(props.color) }}>{props.text}</p>,
});
export const Caption = defineComponent({
  name: 'Caption', props: z.object({ text: z.string() }), description: 'Small secondary text.',
  component: ({ props }) => <p className="iui-caption">{props.text}</p>,
});
export const Label = defineComponent({
  name: 'Label', props: z.object({ text: z.string() }), description: 'Field or group label.',
  component: ({ props }) => <span className="iui-label">{props.text}</span>,
});
export const Badge = defineComponent({
  name: 'Badge', props: z.object({ text: z.string(), color: z.enum(['neutral', 'info', 'success', 'warning', 'danger', 'purple', 'pink']).optional() }), description: 'Short status label.',
  component: ({ props }) => <span className="iui-badge" style={{ color: fg(props.color) }}>{props.text}</span>,
});
export const Link = defineComponent({
  name: 'Link', props: z.object({ text: z.string(), url: z.string() }), description: 'Opens a web URL.',
  component: ({ props }) => {
    const href = webUrl(props.url);
    return href ? <a className="iui-link" href={href} target="_blank" rel="noopener noreferrer">{props.text}</a> : <span>{props.text}</span>;
  },
});
export const Image = defineComponent({
  name: 'Image', props: z.object({ src: z.string(), alt: z.string(), caption: z.string().optional() }), description: 'Image from a known web URL. Never invent image URLs.',
  component: ({ props }) => {
    const src = webUrl(props.src);
    return src ? <figure className="iui-image"><img src={src} alt={props.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />{props.caption ? <figcaption>{props.caption}</figcaption> : null}</figure> : null;
  },
});
export const Carousel = defineComponent({
  name: 'Carousel', props: z.object({ children }), description: 'Horizontally scrolling cards.',
  component: ({ props, renderNode }) => <div className="iui-carousel">{renderNode(props.children)}</div>,
});
export const Flashcard = defineComponent({
  name: 'Flashcard', props: z.object({ front: z.string(), back: z.string(), label: z.string().optional() }), description: 'A study card that flips on click.',
  component: function FlashcardView({ props }) {
    const [flipped, setFlipped] = useState(false);
    return <UiButton className="iui-flashcard" type="button" aria-label={props.label ?? props.front} aria-pressed={flipped} onClick={() => setFlipped(!flipped)}><span className="iui-caption">{props.label}</span><span>{flipped ? props.back : props.front}</span></UiButton>;
  },
});
export const Table = defineComponent({
  name: 'Table',
  props: z.object({ columns: z.array(z.object({ key: z.string(), label: z.string() })), rows: z.array(z.record(z.string(), z.any())), caption: z.string().optional() }),
  description: 'Data table. columns are {key,label}; rows use those keys.',
  component: ({ props }) => <div className="iui-table-wrap"><table className="iui-table">{props.caption ? <caption>{props.caption}</caption> : null}<thead><tr>{props.columns.slice(0, 12).map((col) => <th scope="col" key={col.key}>{col.label}</th>)}</tr></thead><tbody>{props.rows.slice(0, 100).map((row, i) => <tr key={i}>{props.columns.slice(0, 12).map((col) => <td key={col.key}>{['string', 'number', 'boolean'].includes(typeof row[col.key]) ? String(row[col.key]) : ''}</td>)}</tr>)}</tbody></table></div>,
});
