import { useState } from 'react';
import type { IntelligentUiNode } from '@socrates/core';
import { MathText } from '../rn/useInlineMath';
import { Button } from '../ui/Button';
import { asProse, isRecord, resolve, setBoundValue, type RenderContext } from './renderRuntime';

interface AccordionItem {
  id: string;
  title: string;
  content?: string;
  defaultOpen?: boolean;
}

export function UiAccordion({
  node,
  context,
}: {
  node: IntelligentUiNode;
  context: RenderContext;
}) {
  const bind = typeof node.bind === 'string' ? node.bind : '';
  const multiple = Boolean(node.multiple);
  const children = context.children.get(node.id) || [];

  // Parse items from node.items or fallback to child nodes
  const rawItems = Array.isArray(node.items)
    ? (node.items.filter(isRecord) as Array<Record<string, unknown>>)
    : [];

  const items: AccordionItem[] = rawItems.map((item, index) => {
    const id = String(item.id || `acc-item-${index}`);
    const title = asProse(resolve(item.title || item.label || `Section ${index + 1}`, context));
    const content = asProse(resolve(item.content || item.text || item.description, context));
    const defaultOpen = Boolean(item.defaultOpen ?? item.open);
    return { id, title, content, defaultOpen };
  });

  // Local open state if not bound to state
  const [openIds, setOpenIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (bind && context.state[bind] !== undefined) {
      initial.add(String(context.state[bind]));
    } else {
      for (const item of items) {
        if (item.defaultOpen) initial.add(item.id);
      }
      if (initial.size === 0 && items.length > 0) {
        initial.add(items[0].id);
      }
    }
    return initial;
  });

  const toggleItem = (id: string) => {
    if (bind) {
      const next = context.state[bind] === id ? '' : id;
      setBoundValue(context, bind, next);
    } else {
      setOpenIds((prev) => {
        const next = new Set(multiple ? prev : []);
        if (prev.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    }
  };

  const isItemOpen = (id: string) => {
    if (bind) return String(context.state[bind]) === id;
    return openIds.has(id);
  };

  if (!items.length && !children.length) return null;

  return (
    <div className="intui-accordion" data-intui-id={node.id}>
      {items.map((item) => {
        const isOpen = isItemOpen(item.id);
        return (
          <div key={item.id} className={`intui-accordion-item ${isOpen ? 'is-open' : 'is-closed'}`}>
            <Button
              variant="plain"
              type="button"
              className="intui-accordion-trigger"
              onClick={() => toggleItem(item.id)}
              aria-expanded={isOpen}
            >
              <span className="intui-accordion-title">
                <MathText text={item.title} />
              </span>
              <span className="intui-accordion-icon" aria-hidden="true">
                {isOpen ? '▾' : '▸'}
              </span>
            </Button>

            {isOpen && (
              <div className="intui-accordion-content">
                {item.content && (
                  <div className="intui-accordion-body">
                    <MathText text={item.content} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Render child nodes if any */}
      {children.map((child) => (
        <div key={child.id} className="intui-accordion-child">
          {/* Render child node */}
        </div>
      ))}
    </div>
  );
}

export default UiAccordion;
