import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Money } from 'propfirm-calc';

import { signed, tone, usd } from './format.ts';
import { renderChart } from './px/chart.js';
import { mountMenu } from './px/menu.js';

export function Icon({ name }: { name: string }) {
  return <px-icon name={name} />;
}

export function Signed({ value, fraction }: { value: Money; fraction?: number }) {
  return (
    <span className="px-num px-signed" data-tone={tone(value)}>
      {signed(value, fraction)}
    </span>
  );
}

export function Num({ value, fraction }: { value: Money | null | undefined; fraction?: number }) {
  return <span className="px-num">{usd(value, fraction)}</span>;
}

export function Fold({ title, children, open: startOpen = false }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  return (
    <div>
      <h3>
        <button type="button" className="px-accordion-trigger" id={`${id}t`} aria-controls={`${id}p`} aria-expanded={open} onClick={() => setOpen(!open)}>
          {title}
          <Icon name="chevron-down" />
        </button>
      </h3>
      <div className="px-accordion-panel fold-panel" id={`${id}p`} role="region" aria-labelledby={`${id}t`} hidden={!open} data-open={open ? '' : undefined}>
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
      <button ref={trigger} type="button" className="px-btn px-anchor" data-variant={variant} data-size="icon" popoverTarget={id} aria-label={label}>
        <Icon name={icon} />
      </button>
      <div ref={menu} className="px-menu px-overlay" data-overlay="popover" popover="auto" id={id} role="menu" onClick={() => menu.current?.hidePopover()}>
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
    <div className="px-chart" ref={el}>
      <div className="px-chart-plot" />
    </div>
  );
}

export function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="px-card px-stat">
      <div className="px-stat-label">{label}</div>
      <div className="px-stat-value">{children}</div>
      {sub && <div className="px-stat-sub">{sub}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, actions }: { icon: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="px-state">
      <span className="px-state-icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="px-state-actions">{actions}</div>}
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
