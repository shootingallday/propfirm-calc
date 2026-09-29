import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Money } from 'propfirm-calc';

import { signed, tone, usd } from './format.ts';
import { renderChart } from './kit/chart.js';
import { mountMenu } from './kit/menu.js';

export function Icon({ name }: { name: string }) {
  return <ui-icon name={name} />;
}

export function Signed({ value, fraction }: { value: Money; fraction?: number }) {
  return (
    <span className="ui-num ui-signed" data-tone={tone(value)}>
      {signed(value, fraction)}
    </span>
  );
}

export function Num({ value, fraction }: { value: Money | null | undefined; fraction?: number }) {
  return <span className="ui-num">{usd(value, fraction)}</span>;
}

export function Fold({ title, children, open: startOpen = false }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  return (
    <div>
      <h3>
        <button type="button" className="ui-accordion-trigger" id={`${id}t`} aria-controls={`${id}p`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {title}
          <Icon name="chevron-down" />
        </button>
      </h3>
      <div className="ui-accordion-panel fold-panel" id={`${id}p`} role="region" aria-labelledby={`${id}t`} hidden={!open} data-open={open ? '' : undefined}>
        <div>
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

const mounted = new WeakSet<Element>();

export function Menu({ label, icon = 'more', variant = 'ghost', children }: { label: string; icon?: string; variant?: string; children: ReactNode }) {
  const id = useId().replaceAll(':', '');
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu.current || mounted.has(menu.current)) return;
    mounted.add(menu.current);
    mountMenu(menu.current, { trigger: trigger.current });
  }, []);
  return (
    <>
      <button ref={trigger} type="button" className="ui-btn ui-anchor" data-variant={variant} data-size="icon" popoverTarget={id} aria-label={label}>
        <Icon name={icon} />
      </button>
      <div ref={menu} className="ui-menu ui-overlay" data-overlay="popover" popover="auto" id={id} role="menu" onClick={() => menu.current?.hidePopover()}>
        {children}
      </div>
    </>
  );
}

export function Chart({ spec }: { spec: object }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const node = el.current;
    renderChart(node, spec);
    const redraw = () => renderChart(node, spec);
    addEventListener('resize', redraw);
    return () => removeEventListener('resize', redraw);
  }, [spec]);
  return (
    <div className="ui-chart" ref={el}>
      <div className="ui-chart-plot" />
    </div>
  );
}

export function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="ui-card ui-stat">
      <div className="ui-stat-label">{label}</div>
      <div className="ui-stat-value">{children}</div>
      {sub && <div className="ui-stat-sub">{sub}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, actions }: { icon: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ui-state">
      <span className="ui-state-icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="ui-state-actions">{actions}</div>}
    </div>
  );
}

export function PageHead({ title, children, end }: { title: string; children?: ReactNode; end?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {end && <div className="row">{end}</div>}
    </div>
  );
}
