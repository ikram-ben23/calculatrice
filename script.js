/* =========================================================
   Interactive Calculator - vanilla JS
   - Recursive-descent parser (no eval) with correct precedence:
       ( ) / functions  >  % !  >  ^ (right-assoc)  >  unary -/+  >  × ÷  >  + −
   - Scientific mode: sin cos tan asin acos atan ln log √ eˣ |x| π e n! x²
   - DEG / RAD angle unit, Ans (last answer)
   - Implicit multiplication:  2(3+4)  →  14,   2π  →  6.28...
   - Full keyboard support, live preview, history, themes
   ========================================================= */

/* <engine> */
class MathError extends Error {}

function tokenize(src) {
  const tokens = [];
  const re = /(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|asin|acos|atan|sin|cos|tan|sqrt|exp|abs|log|ln|pi|e|[-+*/^%!()])/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new SyntaxError('Invalid input');
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new MathError('Invalid operation');
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

function evaluate(src, deg = true) {
  const t = tokenize(src);
  let i = 0;
  const peek = () => t[i];
  const next = () => t[i++];
  const isNum = (x) => x !== undefined && /^[\d.]/.test(x);
  const isName = (x) => x !== undefined && /^[a-z]/.test(x);

  const toRad = (x) => (deg ? (x * Math.PI) / 180 : x);
  const fromRad = (x) => (deg ? (x * 180) / Math.PI : x);
  const snap = (v) => (Math.abs(v) < 1e-12 ? 0 : v); // sin(180°) → 0, not 1.2e-16
  const invalid = () => new MathError('Invalid operation');

  const FUNCS = {
    sin: (x) => snap(Math.sin(toRad(x))),
    cos: (x) => snap(Math.cos(toRad(x))),
    tan: (x) => {
      const r = toRad(x);
      if (Math.abs(Math.cos(r)) < 1e-12) throw new MathError('Undefined');
      return snap(Math.tan(r));
    },
    asin: (x) => { if (x < -1 || x > 1) throw invalid(); return fromRad(Math.asin(x)); },
    acos: (x) => { if (x < -1 || x > 1) throw invalid(); return fromRad(Math.acos(x)); },
    atan: (x) => fromRad(Math.atan(x)),
    ln:   (x) => { if (x <= 0) throw invalid(); return Math.log(x); },
    log:  (x) => { if (x <= 0) throw invalid(); return Math.log10(x); },
    sqrt: (x) => { if (x < 0) throw invalid(); return Math.sqrt(x); },
    exp:  (x) => Math.exp(x),
    abs:  (x) => Math.abs(x),
  };

  // expr := term (('+' | '-') term)*
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  // term := unary (('*' | '/' | implicit) unary)*
  function term() {
    let v = unary();
    for (;;) {
      const p = peek();
      if (p === '*' || p === '/') {
        next();
        const r = unary();
        if (p === '/') {
          if (r === 0) throw new MathError('Cannot divide by zero');
          v /= r;
        } else {
          v *= r;
        }
      } else if (p === '(' || isNum(p) || isName(p)) {
        v *= unary(); // implicit multiplication: 2(3), (1+2)3, 2pi, 3sin(30)
      } else {
        break;
      }
    }
    return v;
  }

  // unary := ('-' | '+') unary | power      (so -2^2 = -(2^2) = -4)
  function unary() {
    const p = peek();
    if (p === '-') { next(); return -unary(); }
    if (p === '+') { next(); return unary(); }
    return power();
  }

  // power := postfix ('^' unary)?           (right-associative: 2^3^2 = 2^9)
  function power() {
    const base = postfix();
    if (peek() === '^') {
      next();
      const e = unary();
      if (base === 0 && e < 0) throw new MathError('Cannot divide by zero');
      return Math.pow(base, e);
    }
    return base;
  }

  // postfix := primary ('%' | '!')*
  function postfix() {
    let v = primary();
    while (peek() === '%' || peek() === '!') {
      const op = next();
      v = op === '%' ? v / 100 : factorial(v);
    }
    return v;
  }

  // primary := number | constant | function '(' expr ')' | '(' expr ')'
  function primary() {
    const p = next();
    if (p === undefined) throw new SyntaxError('Incomplete expression');
    if (isNum(p)) return parseFloat(p);
    if (p === 'pi') return Math.PI;
    if (p === 'e') return Math.E;
    if (isName(p)) {
      const fn = FUNCS[p];
      if (!fn) throw new SyntaxError('Unknown ' + p);
      if (next() !== '(') throw new SyntaxError('Missing (');
      const arg = expr();
      if (next() !== ')') throw new SyntaxError('Missing )');
      return fn(arg);
    }
    if (p === '(') {
      const v = expr();
      if (next() !== ')') throw new SyntaxError('Missing )');
      return v;
    }
    throw new SyntaxError('Unexpected ' + p);
  }

  const v = expr();
  if (i < t.length) throw new SyntaxError('Unexpected ' + t[i]);
  return v;
}

function calc(src, deg = true) {
  let v = evaluate(src, deg);
  if (Number.isNaN(v)) throw new MathError('Invalid operation');
  if (!Number.isFinite(v)) throw new MathError('Result too large');
  v = parseFloat(v.toPrecision(12)); // 0.1 + 0.2 → 0.3
  return Object.is(v, -0) ? 0 : v;
}

// Drop dangling operators / "(" / "ln(" and auto-close open parentheses.
function finalize(src) {
  let s = src, prev;
  do {
    prev = s;
    s = s
      .replace(/[+\-*/^]+$/, '')
      .replace(/(?:asin|acos|atan|sin|cos|tan|sqrt|exp|abs|log|ln)?\($/, '');
  } while (s !== prev);
  const open = (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
  return s + ')'.repeat(Math.max(0, open));
}
/* </engine> */

/* ---------------- UI ---------------- */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const exprEl = $('#expression');
  const resEl = $('#result');
  const padEl = $('#pad');
  const sciEl = $('#sci');
  const sciBtn = $('#sciBtn');
  const angleBtn = $('#angleBtn');
  const drawer = $('#drawer');
  const listEl = $('#historyList');
  const toastEl = $('#toast');

  const MAX_LEN = 80;
  const SYM = { '*': '×', '/': '÷', '-': '−', '+': '+', '^': '^' };
  const isOp = (c) => c !== '' && '+-*/^'.includes(c);
  // a character that can end a value: digit, ")", "%", "!", constant e / pi
  const isValueEnd = (c) => c !== '' && /[\d)%!ei]/.test(c);

  let expr = '';
  let prevExpr = '';
  let justEvaluated = false;
  let lastValue = null;
  let errorMsg = '';

  /* ---- storage helpers (safe in private mode / file://) ---- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };
  let history = [];
  try { history = JSON.parse(store.get('aurora-history') || '[]'); } catch { history = []; }
  if (!Array.isArray(history)) history = [];

  /* ---- angle unit (DEG / RAD) ---- */
  let angle = store.get('aurora-angle') === 'rad' ? 'rad' : 'deg';
  const isDeg = () => angle === 'deg';
  function updateAngleBtn() {
    angleBtn.textContent = angle.toUpperCase();
    angleBtn.setAttribute('aria-label', 'Angle unit: ' + (isDeg() ? 'degrees' : 'radians'));
  }
  function toggleAngle() {
    angle = isDeg() ? 'rad' : 'deg';
    store.set('aurora-angle', angle);
    updateAngleBtn();
    toast(isDeg() ? 'Degrees' : 'Radians');
    render();
  }

  /* ---- scientific panel ---- */
  function setSci(open) {
    sciEl.classList.toggle('open', open);
    sciBtn.setAttribute('aria-pressed', String(open));
    store.set('aurora-sci', open ? '1' : '0');
  }
  const toggleSci = () => setSci(!sciEl.classList.contains('open'));

  /* ---- formatting ---- */
  function pretty(s) {
    const out = s.replace(/[+\-*/^]/g, (m, off) => {
      const prev = s[off - 1];
      const binary = prev !== undefined && /[\d.)%!ei]/.test(prev);
      return binary ? ` ${SYM[m]} ` : SYM[m];
    });
    return out
      .replace(/sqrt/g, '√')
      .replace(/asin/g, 'sin⁻¹')
      .replace(/acos/g, 'cos⁻¹')
      .replace(/atan/g, 'tan⁻¹')
      .replace(/exp\(/g, 'e^(')
      .replace(/pi/g, 'π');
  }

  function fmt(v) {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e15 || a < 1e-9) return v.toExponential(6).replace(/\.?0+e/, 'e');
    return v.toLocaleString('en-US', { maximumFractionDigits: 10 }).replace('-', '−');
  }

  function formatTyped(s) {
    const neg = s.startsWith('-');
    if (neg) s = s.slice(1);
    const [int, frac] = s.split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + grouped + (frac !== undefined ? '.' + frac : '');
  }

  /* ---- render ---- */
  let lastPreview = '0';
  function render() {
    resEl.classList.remove('preview', 'error');
    let text, raw = '';

    if (errorMsg) {
      text = errorMsg;
      exprEl.textContent = pretty(expr);
      resEl.classList.add('error');
    } else if (justEvaluated) {
      text = fmt(lastValue);
      raw = String(lastValue);
      exprEl.textContent = prevExpr + ' =';
    } else {
      exprEl.textContent = pretty(expr);
      if (expr === '') {
        text = '0';
      } else if (/^-?\d*\.?\d*$/.test(expr)) {
        text = formatTyped(expr);
        raw = expr;
      } else {
        const closed = finalize(expr);
        if (closed === '') {
          text = '0';
        } else {
          try {
            const v = calc(closed, isDeg());
            text = lastPreview = fmt(v);
            raw = String(v);
          } catch {
            text = lastPreview; // keep last valid preview while typing
          }
          resEl.classList.add('preview');
        }
      }
    }

    resEl.textContent = text;
    resEl.dataset.raw = raw;
    const len = text.length;
    resEl.style.fontSize = errorMsg ? '' : len > 18 ? '1.7rem' : len > 14 ? '2.1rem' : len > 10 ? '2.6rem' : '';
    exprEl.scrollLeft = exprEl.scrollWidth;
    resEl.scrollLeft = resEl.scrollWidth;
  }

  function retrigger(cls) {
    resEl.classList.remove('pop', 'shake');
    void resEl.offsetWidth;
    resEl.classList.add(cls);
  }

  /* ---- input logic ---- */
  function startFresh() {
    expr = '';
    prevExpr = '';
    justEvaluated = false;
  }

  function continueFromResult() {
    if (justEvaluated) { justEvaluated = false; prevExpr = ''; }
  }

  function inputDigit(d) {
    if (justEvaluated) startFresh();
    const last = expr.slice(-1);
    if (/[)%!ei]/.test(last)) expr += '*';
    const cur = expr.match(/(\d*\.?\d*)$/)[1];
    if (cur === '0' && d === '0') return;
    if (cur === '0') expr = expr.slice(0, -1);
    expr += d;
  }

  function inputDot() {
    if (justEvaluated) startFresh();
    const last = expr.slice(-1);
    const cur = expr.match(/(\d*\.?\d*)$/)[1];
    if (cur.includes('.')) return;
    if (cur === '') {
      if (isValueEnd(last)) expr += '*';
      expr += '0.';
    } else {
      expr += '.';
    }
  }

  function inputOp(op) {
    continueFromResult();
    const last = expr.slice(-1);

    if (expr === '') {
      if (op === '-') expr = '-';
      else if (lastValue !== null) expr = String(lastValue) + op; // use previous answer
      return;
    }
    if (last === '(') {
      if (op === '-') expr += '-';
      return;
    }
    if (isOp(last)) {
      if (op === '-' && (last === '*' || last === '/' || last === '^')) { expr += '-'; return; } // 2*-3
      let e = expr;
      while (e && isOp(e.slice(-1))) e = e.slice(0, -1);
      if (e === '' || e.slice(-1) === '(') expr = op === '-' ? e + '-' : e;
      else expr = e + op;
      return;
    }
    expr += op;
  }

  function inputPostfix(sym) {
    continueFromResult();
    if (isValueEnd(expr.slice(-1))) expr += sym;
  }

  function inputOpen() {
    continueFromResult();
    if (isValueEnd(expr.slice(-1))) expr += '*';
    expr += '(';
  }

  function inputClose() {
    const open = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
    if (open > 0 && isValueEnd(expr.slice(-1))) expr += ')';
  }

  function inputFunc(name) {
    if (justEvaluated) startFresh();
    if (isValueEnd(expr.slice(-1))) expr += '*';
    expr += name + '(';
  }

  function inputConst(name) {
    if (justEvaluated) startFresh();
    if (isValueEnd(expr.slice(-1))) expr += '*';
    expr += name;
  }

  function inputAns() {
    if (lastValue === null) { toast('No previous answer'); return; }
    if (justEvaluated) startFresh();
    if (isValueEnd(expr.slice(-1))) expr += '*';
    expr += lastValue < 0 ? `(${lastValue})` : String(lastValue);
  }

  function backspace() {
    continueFromResult();
    // delete a whole function name like "sin(" in one go
    const m = expr.match(/(?:asin|acos|atan|sin|cos|tan|sqrt|exp|abs|log|ln)\($|pi$/);
    expr = m ? expr.slice(0, -m[0].length) : expr.slice(0, -1);
  }

  function equals() {
    if (justEvaluated || expr === '') return;
    const src = finalize(expr);
    if (src === '') return;
    try {
      const v = calc(src, isDeg());
      pushHistory(src, v);
      prevExpr = pretty(src);
      lastValue = v;
      expr = String(v);
      justEvaluated = true;
      errorMsg = '';
      render();
      retrigger('pop');
    } catch (e) {
      errorMsg = e instanceof MathError ? e.message : 'Invalid expression';
      render();
      retrigger('shake');
      if (navigator.vibrate) navigator.vibrate(60);
    }
  }

  function press(v) {
    if (drawer.classList.contains('open')) closeDrawer();
    if (errorMsg) errorMsg = '';
    if (expr.length >= MAX_LEN && !['clear', 'back', '='].includes(v) && !justEvaluated) {
      retrigger('shake');
      return;
    }
    if (/^\d$/.test(v)) inputDigit(v);
    else if (v.startsWith('f:')) inputFunc(v.slice(2));
    else if (v.startsWith('c:')) inputConst(v.slice(2));
    else {
      switch (v) {
        case '.': inputDot(); break;
        case '+': case '-': case '*': case '/': case '^': inputOp(v); break;
        case '%': inputPostfix('%'); break;
        case 'fact': inputPostfix('!'); break;
        case 'sq': inputPostfix('^2'); break;
        case '(': inputOpen(); break;
        case ')': inputClose(); break;
        case 'ans': inputAns(); break;
        case 'back': backspace(); break;
        case 'clear': startFresh(); break;
        case '=': equals(); return; // equals renders itself
      }
    }
    render();
  }

  /* ---- history ---- */
  function pushHistory(src, v) {
    if (history[0] && history[0].raw === src) return;
    history.unshift({ raw: src, expr: pretty(src), result: fmt(v) });
    history = history.slice(0, 50);
    store.set('aurora-history', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    listEl.textContent = '';
    history.forEach((item, idx) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'hist-item';
      b.style.animationDelay = Math.min(idx * 30, 300) + 'ms';
      const e = document.createElement('div');
      e.className = 'h-expr';
      e.textContent = item.expr + ' =';
      const r = document.createElement('div');
      r.className = 'h-res';
      r.textContent = item.result;
      b.append(e, r);
      b.addEventListener('click', () => {
        expr = item.raw;
        prevExpr = '';
        justEvaluated = false;
        errorMsg = '';
        closeDrawer();
        render();
      });
      li.append(b);
      listEl.append(li);
    });
  }

  function openDrawer() {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  const toggleDrawer = () => (drawer.classList.contains('open') ? closeDrawer() : openDrawer());

  $('#historyBtn').addEventListener('click', toggleDrawer);
  $('#closeHistory').addEventListener('click', closeDrawer);
  $('#clearHistory').addEventListener('click', () => {
    history = [];
    store.set('aurora-history', '[]');
    renderHistory();
  });

  /* ---- theme ---- */
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    store.set('aurora-theme', t);
  }
  function toggleTheme() {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }
  // Light theme by default (matches the GDG look); the choice is remembered.
  setTheme(store.get('aurora-theme') === 'dark' ? 'dark' : 'light');
  $('#themeBtn').addEventListener('click', toggleTheme);

  /* ---- toast + copy ---- */
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }
  resEl.addEventListener('click', async () => {
    const raw = resEl.dataset.raw;
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      toast('Copied ' + raw);
    } catch {
      toast('Copy not available');
    }
  });

  /* ---- option buttons ---- */
  sciBtn.addEventListener('click', toggleSci);
  angleBtn.addEventListener('click', toggleAngle);

  /* ---- keypad: clicks + ripple (covers keys, scientific keys and Ans) ---- */
  padEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    press(btn.dataset.val);
    if (navigator.vibrate) navigator.vibrate(8);
  });
  padEl.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.left = e.clientX - rect.left + 'px';
    dot.style.top = e.clientY - rect.top + 'px';
    btn.append(dot);
    dot.addEventListener('animationend', () => dot.remove());
  });

  /* ---- keyboard ---- */
  const KEYMAP = {
    Enter: '=', '=': '=',
    Backspace: 'back', Delete: 'clear', Escape: 'clear',
    '.': '.', ',': '.',
    '+': '+', '-': '-', '*': '*', x: '*', X: '*', '/': '/', '^': '^',
    '%': '%', '(': '(', ')': ')', '!': 'fact',
  };
  // letter shortcuts (case-insensitive)
  const LETTERS = {
    s: 'f:sin', c: 'f:cos', l: 'f:ln', g: 'f:log', r: 'f:sqrt',
    p: 'c:pi', e: 'c:e', a: 'ans',
  };

  function flash(val) {
    const btn = padEl.querySelector(`[data-val="${val}"]`);
    if (!btn) return;
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 140);
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;

    if (lower === 'h') { toggleDrawer(); return; }
    if (lower === 't') { toggleTheme(); return; }
    if (lower === 'd') { toggleAngle(); return; }
    if (lower === 'm') { toggleSci(); return; }
    if (k === 'Escape' && drawer.classList.contains('open')) { closeDrawer(); return; }

    const val = /^\d$/.test(k) ? k : KEYMAP[k] || LETTERS[lower];
    if (!val) return;
    e.preventDefault(); // stops "/" quick-find and Enter re-clicking a focused button
    flash(val);
    press(val);
  });

  setSci(store.get('aurora-sci') !== '0'); // open by default on first visit
  updateAngleBtn();
  renderHistory();
  render();
})();
