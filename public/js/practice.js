import { buildUnits } from './units.js';
import { WritingSurface } from './surface.js';
import {
  compareStroke,
  pathLength,
  scoreUnit,
  strokeIssues,
  starsFor,
  unitTips,
  TOLERANCE,
} from './scoring.js';
import { h, icon, toast, starsEl, segmented, burstConfetti, openSheet, switchRow, clear } from './ui.js';
import { makeT } from './i18n.js';
import { sfx, setSound, unlockAudio } from './sound.js';
import { addEntry } from './history.js';
import { setOverride, clearOverrides } from './settings.js';

const MODES = ['trace', 'copy', 'memory'];

export class Practice {
  constructor({ config, settings, item, set, lang, setName, onExit, onNext }) {
    this.config = config;
    this.settings = { ...settings };
    this.item = item;
    this.set = set;
    this.lang = lang;
    this.setName = setName;
    this.onExit = onExit;
    this.onNext = onNext;
    this.t = makeT(this.settings.uiLang);
    this.tolerance = TOLERANCE[this.settings.tolerance] || 1;

    this.units = [];
    this.index = 0;
    this.results = [];
    this.header = [];
    this.state = null;
    this.pending = null;
    this.mode = this.settings.mode;
    this._timers = [];
    this._destroyed = false;
  }

  async mount() {
    this.root = h('div', { class: 'practice' });
    this.root.style.setProperty('--box-scale', String(this.settings.boxScale || 1));
    this._buildChrome();
    document.getElementById('app').append(this.root);
    this.surface = new WritingSurface(this.canvas, {
      guideOpacity: this.settings.guideOpacity,
      inkWidth: this.settings.inkWidth,
      inkColor: this.settings.inkColor,
      showNumbers: this.settings.showNumbers,
      gridHanzi: this.settings.gridHanzi,
      gridLatin: this.settings.gridLatin,
      penOnly: this.settings.penOnly,
    });
    this.surface.onStrokeStart = () => {
      this.hintEl.classList.remove('show');
    };
    this.surface.onStrokeEnd = (rec) => this._strokeEnd(rec);
    setSound(this.settings.sound);

    try {
      await this._load();
    } catch (err) {
      this._showError(err);
    }
  }

  destroy() {
    this._destroyed = true;
    for (const id of this._timers) clearTimeout(id);
    this._timers = [];
    this._resultWrap?.remove();
    this._resultWrap = null;
    this._resultCleanup = null;
    this.surface?.destroy();
    this.root?.remove();
  }

  _later(fn, ms) {
    const id = setTimeout(() => {
      if (!this._destroyed) fn();
    }, ms);
    this._timers.push(id);
    return id;
  }

  /* --------------------------------- view -------------------------------- */

  _buildChrome() {
    const t = this.t;
    this.wordEl = h('div', { class: 'p-word' });
    this.pinyinEl = h('div', { class: 'p-pinyin' });
    this.progressEl = h('div', { class: 'p-progress' }, '1 / 1');

    const backBtn = h(
      'button',
      { class: 'icon-btn', 'aria-label': t('practice.back'), onclick: () => this.onExit?.() },
      icon('back'),
    );

    const settingsBtn = h(
      'button',
      { class: 'icon-btn', 'aria-label': t('settings.title'), onclick: () => this._openSettings() },
      icon('settings'),
    );

    const head = h(
      'header',
      { class: 'p-head' },
      backBtn,
      h('div', { class: 'p-title' }, this.wordEl, this.pinyinEl),
      this.progressEl,
      settingsBtn,
    );

    this.modeRow = h('div', { class: 'mode-pills', role: 'group' });
    for (const m of MODES) {
      this.modeRow.append(
        h(
          'button',
          {
            'aria-pressed': String(m === this.mode),
            onclick: () => this._setMode(m),
          },
          t(`practice.${m}`),
        ),
      );
    }

    this.canvas = h('canvas');
    this.badge = h('div', { class: 'unit-badge' });
    this.stage = h('div', { class: 'stage' }, this.canvas, this.badge);
    this.hintEl = h('div', { class: 'p-hint' });

    const body = h(
      'div',
      { class: 'p-body' },
      h('div', { class: 'mode-row' }, this.modeRow),
      this.stage,
      this.hintEl,
    );

    this.btnShow = this._tool('play', t('practice.demo'), () => this._demo());
    this.btnHint = this._tool('bulb', t('practice.hint'), () => this._hint());
    this.btnUndo = this._tool('undo', t('practice.undo'), () => this._undo());
    this.btnClear = this._tool('eraser', t('practice.clear'), () => this._clear());
    this.btnPrimary = this._tool('check', t('practice.check'), () => this._primary(), 'main');

    const toolbar = h(
      'footer',
      { class: 'p-toolbar' },
      this.btnShow,
      this.btnHint,
      this.btnUndo,
      this.btnClear,
      this.btnPrimary,
    );

    this.root.append(head, body, toolbar);
    this.root.addEventListener('pointerdown', unlockAudio, { once: true });
  }

  _tool(iconName, label, onClick, extra = '') {
    return h(
      'button',
      { class: `tool ${extra}`.trim(), type: 'button', onclick: onClick },
      icon(iconName),
      h('span', {}, label),
    );
  }

  _setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    setOverride('mode', mode);
    this.settings.mode = mode;
    for (const [i, m] of MODES.entries()) {
      this.modeRow.children[i]?.setAttribute('aria-pressed', String(m === mode));
    }
    if (this.units.length) this._startUnit();
  }

  /* --------------------------------- load -------------------------------- */

  async _load() {
    this._loading(true);
    const built = await buildUnits(this.item, this.lang);
    this.units = built.units;
    this.pinyin = built.pinyin;
    this.meaning = built.meaning;
    this.header = built.header;
    this._loading(false);
    this.index = 0;
    this.results = [];
    this._startUnit();
  }

  _loading(on) {
    if (on) {
      if (this.loadingEl) return;
      this.loadingEl = h(
        'div',
        { class: 'loading-box' },
        h('div', { class: 'spinner' }),
        h('div', {}, this.t('practice.loading')),
      );
      this.stage.append(this.loadingEl);
    } else {
      this.loadingEl?.remove();
      this.loadingEl = null;
    }
  }

  _startUnit() {
    const unit = this.units[this.index];
    if (!unit) return;
    this.state = { next: 0, accepted: [], fails: 0, done: false };
    this.pending = null;

    this._renderHeader();
    this.progressEl.textContent = `${this.index + 1} / ${this.units.length}`;
    this.surface.configure({
      guideOpacity: this.settings.guideOpacity,
      inkWidth: this.settings.inkWidth,
      inkColor: this.settings.inkColor,
      showNumbers: this.settings.showNumbers,
    });
    this.surface.setUnit(unit, { mode: this.mode });

    if (this.mode === 'trace') {
      this._say(this.t('practice.firstStroke'), false);
    } else {
      this._say(this.t('practice.writeIt'), false);
    }
    this._updateButtons();
  }

  _renderHeader() {
    clear(this.wordEl);
    const highlight = this.units.length > 1;
    for (const part of this.header) {
      const isCurrent = highlight && part.unitIndex === this.index;
      const text = part.ch === ' ' ? '\u00A0' : part.ch;
      this.wordEl.append(isCurrent ? h('span', { class: 'cur' }, text) : document.createTextNode(text));
    }
    const bits = [];
    if (this.settings.showPinyin && this.pinyin) bits.push(this.pinyin);
    if (this.settings.showMeaning && this.meaning) bits.push(this.meaning);
    this.pinyinEl.textContent = bits.join(' · ');
  }

  /* -------------------------------- strokes ------------------------------- */

  _strokeEnd(rec) {
    if (this.mode !== 'trace' || !this.state || this.state.done) {
      this._updateButtons();
      return;
    }
    const unit = this.units[this.index];
    const idx = this.state.next;
    const ref = unit.strokes[idx];
    if (!ref) return;

    const points = rec.points.map((p) => [p.x, p.y]);
    const cmp = compareStroke(points, ref.median, this.tolerance);

    if (cmp.score >= this.settings.threshold && !cmp.reversed) {
      rec.color = this.settings.inkColor;
      this.state.accepted.push(cmp);
      this.state.next += 1;
      this.state.fails = 0;
      sfx.ok();
      if (this.state.next >= unit.strokes.length) {
        this._finishTraceUnit();
      } else {
        this.surface.setHint(this.state.next);
        this._say(
          this.t('practice.strokeProgress', { a: this.state.next + 1, b: unit.strokes.length }),
          false,
        );
        this._updateButtons();
      }
    } else {
      this.surface.rejectStroke(rec);
      this.state.fails += 1;
      sfx.bad();
      this._say(this._attemptTip(cmp, idx), true);
      if (this.state.fails >= 2) this.surface.playStrokeHint(idx);
      this._updateButtons();
    }
  }

  _say(text, isError = false) {
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('err', isError);
    this.hintEl.classList.add('show');
  }

  _attemptTip(cmp, idx) {
    const issue = strokeIssues(cmp)[0];
    if (!issue) return this.t('practice.startHint');
    return this.t(`tip.${issue}`, { n: idx + 1 });
  }

  _finishTraceUnit() {
    if (this.state.done) return;
    this.state.done = true;
    const unit = this.units[this.index];
    const refs = unit.strokes.map((s) => s.median);
    const weights = refs.map((s) => 0.45 + Math.min(1.1, pathLength(s) * 1.4));
    const totalW = weights.reduce((a, b) => a + b, 0);
    let got = 0;
    this.state.accepted.forEach((cmp, i) => {
      got += cmp.score * weights[i];
    });
    const score = totalW > 0 ? Math.min(1, got / totalW) : 0;
    const pct = Math.round(score * 100);
    const result = {
      score,
      pct,
      stars: starsFor(pct),
      strokes: this.state.accepted.map((cmp, i) => ({ refIndex: i, userIndex: i, ...cmp })),
      missing: refs.slice(this.state.accepted.length).map((_, i) => this.state.accepted.length + i),
      extra: [],
    };
    this.results[this.index] = result;
    this.surface.setHint(-1);
    this.surface.applyResult(result);
    sfx.done();

    const last = this.index === this.units.length - 1;
    if (last) {
      this._later(() => this._showWordResult(), 650);
      return;
    }

    this._flashBadge(result);
    if (this.settings.autoNext) {
      this._later(() => this._advance(), 1550);
    } else {
      this._updateButtons();
    }
  }

  _checkFree() {
    if (!this.surface.hasInk()) {
      toast(this.t('toast.noInk'));
      return;
    }
    const unit = this.units[this.index];
    const refs = unit.strokes.map((s) => s.median);
    const result = scoreUnit(refs, this.surface.getInkStrokes(), this.tolerance);
    this.surface.applyResult(result);
    this.state.done = true;
    sfx.done();
    if (this.index === this.units.length - 1) {
      this.results[this.index] = result;
      this._later(() => this._showWordResult(), 500);
    } else {
      this.pending = result;
      this._later(() => this._showUnitResult(result), 400);
    }
  }

  _advance() {
    if (this.index >= this.units.length - 1) {
      this._showWordResult();
      return;
    }
    this.index += 1;
    this._startUnit();
  }

  /* ------------------------------- toolbar -------------------------------- */

  _demo() {
    if (!this.surface.unit) return;
    this.surface.playDemo();
    this.hintEl.classList.remove('show');
  }

  _hint() {
    if (!this.surface.unit) return;
    if (this.mode === 'trace' && this.state) {
      this.surface.playStrokeHint(Math.min(this.state.next, this.surface.unit.strokes.length - 1));
    } else {
      this.surface.playDemo();
    }
  }

  _undo() {
    if (!this.surface.hasInk()) return;
    this.surface.undo();
    if (this.mode === 'trace' && this.state && !this.state.done) {
      this.state.accepted.pop();
      this.state.next = Math.max(0, this.state.next - 1);
      this.surface.setHint(this.state.next);
    }
    this._updateButtons();
  }

  _clear() {
    this.surface.stopAnimation();
    this.surface.clearInk();
    if (this.state) {
      this.state = { next: 0, accepted: [], fails: 0, done: false };
    }
    this.pending = null;
    if (this.mode === 'trace') this.surface.setHint(0);
    this._updateButtons();
  }

  _primary() {
    if (this.state?.done) {
      this._advance();
      return;
    }
    if (this.mode === 'trace') {
      if (!this.surface.hasInk()) {
        toast(this.t('toast.noInk'));
        return;
      }
      this._finishTraceUnit();
    } else {
      this._checkFree();
    }
  }

  _updateButtons() {
    const ink = this.surface?.hasInk();
    this.btnUndo.disabled = !ink;
    this.btnClear.disabled = !ink;
    const canAdvance = this.state?.done && this.index < this.units.length - 1;
    this.btnPrimary.disabled = !ink && !this.state?.done;
    this.btnPrimary.lastChild.textContent = canAdvance ? this.t('practice.next') : this.t('practice.check');
    this.btnPrimary.firstChild.replaceWith(icon(canAdvance ? 'chevron' : 'check'));
  }

  /* -------------------------------- results ------------------------------- */

  _flashBadge(result) {
    clear(this.badge);
    this.badge.append(
      h('div', { class: 'ub-score' }, `${result.pct}`),
      starsEl(result.stars, 5),
      h('div', { class: 'ub-label' }, this.t('result.unit', { pct: result.pct })),
    );
    this.badge.classList.add('show');
    this._later(() => this.badge.classList.remove('show'), 1250);
  }

  _wordStats() {
    const results = this.results.filter(Boolean);
    const avg = results.length
      ? Math.round(results.reduce((sum, r) => sum + r.pct, 0) / results.length)
      : 0;
    return {
      avg,
      stars: starsFor(avg),
      totalStars: results.reduce((sum, r) => sum + r.stars, 0),
      results,
    };
  }

  _showUnitResult(result) {
    const t = this.t;
    const tips = this.settings.showTips ? this._tipsFor(result) : [];
    const card = this._resultCard({
      pct: result.pct,
      stars: result.stars,
      title: this._feedback(result.pct),
      word: this.units[this.index].char,
      meaning: '',
      tips,
      actions: [
        {
          label: t('result.again'),
          kind: 'ghost',
          onClick: (close) => {
            close();
            this.pending = null;
            this.surface.clearInk();
            this.state = { next: 0, accepted: [], fails: 0, done: false };
            if (this.mode === 'trace') this.surface.setHint(0);
            this._updateButtons();
          },
        },
        {
          label: t('practice.next'),
          kind: 'primary',
          onClick: (close) => {
            close();
            if (this.pending) this.results[this.index] = this.pending;
            this.pending = null;
            this._advance();
          },
        },
      ],
    });
    document.body.append(card.wrap);
    this._resultWrap = card.wrap;
    this._resultCleanup = card.close;
  }

  _showWordResult() {
    const t = this.t;
    if (this._resultCleanup) return;
    const stats = this._wordStats();
    const tips = this.settings.showTips ? this._collectTips() : [];
    const unitChips =
      this.units.length > 1
        ? this.units.map((u, i) => {
            const r = this.results[i];
            return h(
              'div',
              { class: 'rc-unit' },
              h('span', { class: 'u' }, u.char),
              h('span', { class: 's' }, '★'.repeat(r?.stars || 0)),
            );
          })
        : null;

    const actions = [];
    if (this.onNext && this.set) {
      actions.push({
        label: t('result.next'),
        kind: 'primary',
        onClick: (close) => {
          close();
          this.onNext();
        },
      });
    }
    actions.push({
      label: t('result.again'),
      kind: this.onNext && this.set ? 'ghost' : 'primary',
      onClick: (close) => {
        close();
        this.results = [];
        this.index = 0;
        this._startUnit();
      },
    });

    const card = this._resultCard({
      pct: stats.avg,
      stars: stats.stars,
      title: stats.avg >= 90 ? t('result.perfect') : t('result.title'),
      word: this.item.text,
      meaning: this.meaning || '',
      tips,
      unitChips,
      actions,
      onHome: (close) => {
        close();
        this.onExit?.();
      },
    });
    document.body.append(card.wrap);
    this._resultWrap = card.wrap;
    this._resultCleanup = card.close;

    addEntry({
      text: this.item.text,
      lang: this.lang,
      setName: this.setName,
      pct: stats.avg,
      stars: stats.stars,
    });

    if (stats.avg >= 76) {
      sfx.done();
      burstConfetti();
    }
  }

  _feedback(pct) {
    const t = this.t;
    if (pct >= 90) return t('fb.perfect');
    if (pct >= 76) return t('fb.great');
    if (pct >= 60) return t('fb.good');
    if (pct >= 40) return t('fb.ok');
    return t('fb.try');
  }

  _tipsFor(result) {
    return unitTips(result, 2).map((tip) => this.t(`tip.${tip.issue}`, { n: tip.stroke }));
  }

  _collectTips() {
    const out = [];
    for (const [i, result] of this.results.entries()) {
      if (!result) continue;
      const prefix = this.units.length > 1 ? `${this.units[i]?.char} · ` : '';
      for (const tip of unitTips(result, 1)) {
        const text = prefix + this.t(`tip.${tip.issue}`, { n: tip.stroke });
        if (!out.includes(text)) out.push(text);
      }
      if (out.length >= 2) break;
    }
    return out.slice(0, 2);
  }

  _resultCard({ pct, stars, title, word, meaning, tips, unitChips, actions, onHome }) {
    const t = this.t;
    const ringColor = pct >= 76 ? '#16a34a' : pct >= 55 ? '#f59e0b' : '#ef4444';
    const wrap = h('div', { class: 'result-wrap' });
    const card = h(
      'div',
      { class: 'result-card', role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'score-ring', style: { '--pct': pct, '--ring': ringColor } },
        h('b', {}, String(pct), h('small', {}, '%')),
      ),
      starsEl(stars, 5, 'lg'),
      h('h2', {}, title),
      h('div', { class: 'rc-word' }, word),
      meaning ? h('div', { class: 'rc-meaning' }, meaning) : null,
      unitChips ? h('div', { class: 'rc-units' }, ...unitChips) : null,
      tips?.length
        ? h('ul', { class: 'rc-tips' }, ...tips.map((tip) => h('li', {}, tip)))
        : null,
      h(
        'div',
        { class: 'rc-actions' },
        ...actions.map((a) =>
          h(
            'button',
            {
              class: `btn ${a.kind}`,
              onclick: () => {
                a.onClick(close);
              },
            },
            a.label,
          ),
        ),
      ),
      onHome
        ? h(
            'button',
            {
              class: 'btn ghost block',
              style: { marginTop: '8px' },
              onclick: () => onHome(close),
            },
            t('result.home'),
          )
        : null,
    );
    wrap.append(card);
    const close = () => {
      wrap.remove();
      this._resultWrap = null;
      this._resultCleanup = null;
    };
    return { wrap, close };
  }

  /* -------------------------------- errors -------------------------------- */

  _showError(err) {
    clear(this.root);
    const t = this.t;
    const noData = err?.message === 'no_data';
    this.root.append(
      h(
        'div',
        { class: 'error-screen' },
        h('div', { class: 'err-emoji' }, noData ? '🈳' : '📡'),
        h('h2', {}, noData ? t('practice.noData', { char: err.char || '?' }) : t('toast.loadFail')),
        h('p', {}, noData ? t('practice.noDataBody') : ''),
        h(
          'div',
          { style: { display: 'flex', gap: '10px', marginTop: '18px' } },
          h('button', { class: 'btn ghost', onclick: () => this.onExit?.() }, t('practice.back')),
          h(
            'button',
            {
              class: 'btn primary',
              onclick: () => location.reload(),
            },
            this.t('common.retry'),
          ),
        ),
      ),
    );
  }

  /* ------------------------------- settings ------------------------------- */

  _openSettings() {
    const t = this.t;
    const s = this.settings;
    const body = h('div', {});
    body.append(
      switchRow(t('settings.sound'), t('settings.soundDesc'), s.sound, (on) => {
        s.sound = on;
        setOverride('sound', on);
        setSound(on);
      }),
      switchRow(t('settings.penOnly'), t('settings.penOnlyDesc'), s.penOnly, (on) => {
        s.penOnly = on;
        setOverride('penOnly', on);
        this.surface.configure({ penOnly: on });
      }),
      switchRow(t('settings.guide'), '', s.showNumbers, (on) => {
        s.showNumbers = on;
        setOverride('showNumbers', on);
        this.surface.setNumbers(on);
      }),
      h(
        'div',
        { class: 'row' },
        h('div', { class: 'label' }, t('practice.modeLabel')),
        segmented(
          MODES.map((m) => ({ id: m, label: t(`practice.${m}`) })),
          this.mode,
          (m) => this._setMode(m),
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '10px', marginTop: '16px' } },
        h(
          'button',
          {
            class: 'btn ghost',
            style: { flex: '1' },
            onclick: () => {
              clearOverrides();
              location.reload();
            },
          },
          t('settings.reset'),
        ),
        h(
          'button',
          {
            class: 'btn primary',
            style: { flex: '1' },
            onclick: () => sheet.close(),
          },
          t('settings.done'),
        ),
      ),
    );
    const sheet = openSheet({ title: t('settings.title'), sub: t('settings.sub'), body });
  }
}
