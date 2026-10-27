const NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  back: { paths: ['M15 18l-6-6 6-6'] },
  play: { paths: ['M7 4.6v14.8L20 12 7 4.6z'], fill: true },
  bulb: {
    paths: [
      'M9 18h6',
      'M10 22h4',
      'M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
    ],
  },
  undo: { paths: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'] },
  eraser: { paths: ['M20 20H9l-5-5a2 2 0 0 1 0-3l8-8 8 8-8 8'] },
  check: { paths: ['M20 6 9 17l-5-5'] },
  chevron: { paths: ['M9 18l6-6-6-6'] },
  star: { paths: ['M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5L2.6 9.4l6.5-.9z'], fill: true },
  settings: {
    paths: [
      'M4 21v-7',
      'M4 10V3',
      'M12 21v-9',
      'M12 8V3',
      'M20 21v-5',
      'M20 12V3',
      'M1 14h6',
      'M9 8h6',
      'M17 16h6',
    ],
  },
  home: { paths: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5'] },
  pencil: { paths: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'] },
  volume: { paths: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'] },
  lock: { paths: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'] },
  plus: { paths: ['M12 5v14', 'M5 12h14'] },
  trash: { paths: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 15h10l1-15'] },
  download: { paths: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 20h16'] },
  upload: { paths: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'] },
  save: { paths: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M7 3v6h8V3', 'M7 21v-8h10v8'] },
  x: { paths: ['M18 6 6 18', 'M6 6l12 12'] },
  users: { paths: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M23 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'] },
  sparkle: { paths: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'] },
  grid: { paths: ['M3 9h18', 'M3 15h18', 'M9 3v18', 'M15 3v18'] },
  eye: { paths: ['M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'] },
  refresh: { paths: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'] },
};

export function icon(name, cls = '') {
  const def = ICONS[name] || { paths: [] };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', def.fill ? 'currentColor' : 'none');
  svg.setAttribute('stroke', def.fill ? 'none' : 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  for (const d of def.paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, val] of Object.entries(value)) {
        if (prop.startsWith('--')) node.style.setProperty(prop, String(val));
        else node.style[prop] = val;
      }
    }
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'value' && 'value' in node) node.value = value;
    else if (key in node && key !== 'list' && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

let toastTimer = 0;
export function toast(message, ms = 1900) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function starsEl(count, max = 5, cls = '') {
  const wrap = h('span', { class: `stars ${cls}`.trim(), 'aria-label': `${count}/${max}` });
  for (let i = 0; i < max; i += 1) {
    const s = icon('star');
    if (i >= count) {
      s.style.opacity = '0.22';
    }
    wrap.append(s);
  }
  return wrap;
}

export function openSheet({ title, sub, body, onClose }) {
  const back = h('div', { class: 'sheet-back' });
  const sheet = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('h3', {}, title),
    sub ? h('p', { class: 'sub' }, sub) : null,
    body,
  );
  back.append(sheet);
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  back.addEventListener('click', (e) => {
    if (e.target === back) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(back);
  return { close, sheet };
}

export function switchRow(label, desc, checked, onChange) {
  const sw = h('button', {
    class: 'switch',
    role: 'switch',
    'aria-checked': String(Boolean(checked)),
    onclick: () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(next));
      onChange(next);
    },
  });
  return h(
    'div',
    { class: 'row' },
    h('div', {}, h('div', { class: 'label' }, label), desc ? h('div', { class: 'desc' }, desc) : null),
    sw,
  );
}

export function segmented(options, value, onChange) {
  const seg = h('div', { class: 'seg', role: 'group' });
  options.forEach((opt, idx) => {
    seg.append(
      h(
        'button',
        {
          'aria-pressed': String(opt.id === value),
          onclick: () => {
            [...seg.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === idx)));
            onChange(opt.id);
          },
        },
        opt.label,
      ),
    );
  });
  return seg;
}

/* ------------------------------- confetti -------------------------------- */

export function burstConfetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let canvas = document.getElementById('confetti');
  if (!canvas) {
    canvas = h('canvas', { id: 'confetti' });
    document.body.append(canvas);
  }
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const hgt = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${hgt}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ['#4f46e5', '#f97316', '#22c55e', '#ec4899', '#f59e0b', '#06b6d4'];
  const parts = Array.from({ length: 90 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 120,
    y: hgt * 0.42 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 9,
    vy: -4 - Math.random() * 8,
    size: 4 + Math.random() * 7,
    rot: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    color: colors[(Math.random() * colors.length) | 0],
    life: 1,
  }));

  const start = performance.now();
  const tick = (t) => {
    const dt = Math.min(32, t - (tick.last || t)) / 16;
    tick.last = t;
    ctx.clearRect(0, 0, w, hgt);
    let alive = false;
    for (const p of parts) {
      p.vy += 0.32 * dt;
      p.vx *= 0.995;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life = Math.max(0, 1 - (t - start) / 2400);
      if (p.life <= 0) continue;
      alive = true;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(tick);
    else {
      ctx.clearRect(0, 0, w, hgt);
      canvas.remove();
    }
  };
  requestAnimationFrame(tick);
}
