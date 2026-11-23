// Мінімальне «браузерне» оточення, щоб запускати ігри (ES-модулі з public/js/games) у Node.js
// без зовнішніх бібліотек (без jsdom). Підтримує рівно те, що використовують ігри:
// createElement, append/appendChild, textContent, classList, dataset, style,
// addEventListener/click, querySelector(All) з простими селекторами.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PUBLIC = path.join(ROOT, 'public');

function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

// ---------- Селектори: "tag", ".class", "#id", "[attr]", "[attr=\"v\"]", нащадки через пробіл, кома ----------
function parseCompound(part, whole) {
  const c = { tag: null, classes: [], attrs: [] };
  const re = /([a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/y;
  re.lastIndex = 0;
  while (re.lastIndex < part.length) {
    const m = re.exec(part);
    if (!m) throw new Error('Непідтримуваний селектор у тестовому DOM: ' + whole);
    if (m[1]) c.tag = m[1].toUpperCase();
    else if (m[2]) c.classes.push(m[2]);
    else if (m[3]) c.attrs.push(['id', m[3]]);
    else c.attrs.push([m[4], m[5]]);
  }
  return c;
}
function parseSelector(sel) {
  return sel.split(',').map((one) => one.trim().split(/\s+/).map((p) => parseCompound(p, sel)));
}
function matchesCompound(el, c) {
  if (!el || el._kind !== 'element') return false;
  if (c.tag && el.tagName !== c.tag) return false;
  for (const cls of c.classes) if (!el.classList.contains(cls)) return false;
  for (const [name, value] of c.attrs) {
    const v = el.getAttribute(name);
    if (value === undefined ? v === null : v !== value) return false;
  }
  return true;
}
function matchesChain(el, chain) {
  if (!matchesCompound(el, chain[chain.length - 1])) return false;
  let i = chain.length - 2;
  let p = el.parentNode;
  while (i >= 0 && p) {
    if (matchesCompound(p, chain[i])) i--;
    p = p.parentNode;
  }
  return i < 0;
}

// ---------- Вузли ----------
class FakeNode {
  constructor(doc, tag, kind) {
    this.ownerDocument = doc;
    this._kind = kind || 'element';
    this.tagName = String(tag).toUpperCase();
    this.nodeName = this.tagName;
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.id = '';
    this.disabled = false;
    this.dataset = {};
    this.style = { setProperty(k, v) { this[k] = String(v); } };
    this._text = '';
    this._attrs = {};
    this._listeners = {};
  }

  get classList() {
    const self = this;
    const list = () => self.className.split(/\s+/).filter(Boolean);
    return {
      add: (...c) => { self.className = [...new Set([...list(), ...c])].join(' '); },
      remove: (...c) => { self.className = list().filter((x) => !c.includes(x)).join(' '); },
      contains: (c) => list().includes(c),
      toggle: (c) => { if (list().includes(c)) { self.classList.remove(c); return false; } self.classList.add(c); return true; }
    };
  }

  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) {
    this.children.forEach((c) => { c.parentNode = null; });
    this.children = [];
    this._text = v == null ? '' : String(v);
  }

  get childNodes() { return this._text ? [{ textContent: this._text }, ...this.children] : this.children.slice(); }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }

  appendChild(node) {
    if (node._kind === 'fragment') {
      node.children.slice().forEach((c) => this.appendChild(c));
      return node;
    }
    if (node.parentNode) node.parentNode._removeChild(node);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  append(...nodes) {
    nodes.forEach((n) => this.appendChild(typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n));
  }
  _removeChild(node) {
    this.children = this.children.filter((c) => c !== node);
    node.parentNode = null;
  }
  remove() { if (this.parentNode) this.parentNode._removeChild(this); }

  setAttribute(name, value) {
    const v = String(value);
    if (name === 'id') this.id = v;
    else if (name === 'class') this.className = v;
    else if (name.startsWith('data-')) this.dataset[camel(name.slice(5))] = v;
    else this._attrs[name] = v;
  }
  getAttribute(name) {
    if (name === 'id') return this.id || null;
    if (name === 'class') return this.className || null;
    if (name.startsWith('data-')) {
      const k = camel(name.slice(5));
      return k in this.dataset ? String(this.dataset[k]) : null;
    }
    return name in this._attrs ? this._attrs[name] : null;
  }

  addEventListener(type, fn) {
    // Як у браузері: слухач, що не є функцією (напр. undefined), просто ігнорується
    if (typeof fn !== 'function') return;
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  dispatchEvent(evt) {
    const type = typeof evt === 'string' ? evt : evt.type;
    (this._listeners[type] || []).slice().forEach((fn) => fn.call(this, { type, target: this, preventDefault() {} }));
    return true;
  }
  // Як у браузері: клік по вимкненій кнопці нічого не робить.
  click() { if (!this.disabled) this.dispatchEvent('click'); }
  focus() { this.ownerDocument.activeElement = this; }

  _descendants() {
    const out = [];
    const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); });
    walk(this);
    return out;
  }
  querySelectorAll(sel) {
    const chains = parseSelector(sel);
    return this._descendants().filter((el) => chains.some((ch) => matchesChain(el, ch)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function createDocument() {
  const doc = { title: '', activeElement: null };
  doc.createElement = (tag) => new FakeNode(doc, tag);
  doc.createTextNode = (t) => { const n = new FakeNode(doc, '#text', 'text'); n._text = String(t); return n; };
  doc.createDocumentFragment = () => new FakeNode(doc, '#fragment', 'fragment');
  doc.documentElement = doc.createElement('html');
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.getElementById = (id) => doc.documentElement._descendants().find((e) => e.id === id) || null;
  doc.querySelector = (s) => doc.documentElement.querySelector(s);
  doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);
  return doc;
}

// fetch, що читає файли з папки public (як статичний сервер). Приймає і відносні шляхи, і file:-URL.
function fileResponse(url) {
  const file = url.startsWith('file:')
    ? fileURLToPath(url.split(/[?#]/)[0])
    : path.join(PUBLIC, decodeURIComponent(url.split(/[?#]/)[0]));
  if (!path.resolve(file).startsWith(PUBLIC) || !fs.existsSync(file)) {
    return { ok: false, status: 404, json: () => Promise.reject(new Error('404')) };
  }
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  return { ok: true, status: 200, json: () => Promise.resolve().then(() => JSON.parse(text)) };
}

/**
 * Ставить у globalThis «браузерні» document, location, api і fetch.
 * options.search     — рядок location.search, напр. '?g=quiz'
 * options.fetch      — (url) => відповідь {ok, status, json()}; за замовчуванням читає файли з public/
 * options.saveResult — (body) => Promise; за замовчуванням успіх
 * Тести в одному файлі йдуть по черзі, тому кожен тест просто ставить собі нове оточення.
 */
export function installBrowser(options = {}) {
  const document = createDocument();
  const saved = [];
  const fetchCalls = [];
  const consoleErrors = [];
  globalThis.document = document;
  globalThis.location = { search: options.search || '' };
  globalThis.api = {
    saveResult(body) {
      saved.push(JSON.parse(JSON.stringify(body)));
      return options.saveResult ? options.saveResult(body) : Promise.resolve({ ok: true });
    }
  };
  globalThis.fetch = (url) => {
    const s = url instanceof URL ? url.href : String(url);
    fetchCalls.push(s);
    return Promise.resolve(options.fetch ? options.fetch(s) : fileResponse(s));
  };
  // Ігри пишуть у console.error, коли не вдалося завантажити дані, — збираємо, а не друкуємо
  console.error = (...a) => consoleErrors.push(a.map(String).join(' '));
  return { document, saved, fetchCalls, consoleErrors };
}

export function gameUrl(id) {
  return pathToFileURL(path.join(PUBLIC, 'js', 'games', id + '.js')).href;
}

/** Імпортує гру public/js/games/<id>.js, ставить нове оточення і монтує гру в новий контейнер. */
export async function mountGame(id, options) {
  const mod = await import(gameUrl(id));
  const env = installBrowser(options);
  const root = env.document.createElement('div');
  env.document.body.appendChild(root);
  mod.mount(root);
  return Object.assign(env, { mod, root, panel: () => root.querySelector('.panel') });
}

/** Дає відпрацювати всім промісам (fetch → json → обробка). */
export async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

/** Чекає, поки умова стане істинною (напр. динамічний import у game-page.js). */
export async function waitFor(check, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('Не дочекалися умови за ' + ms + ' мс');
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** Знаходить кнопку (або інший елемент) за точним текстом. */
export function findByText(container, selector, text) {
  const found = container.querySelectorAll(selector).find((e) => e.textContent.trim() === text);
  if (!found) throw new Error(`Не знайдено «${selector}» з текстом «${text}»`);
  return found;
}

/**
 * Дістає літерал масиву/об'єкта з вихідного коду, напр. extractLiteral('server/server.js', 'GAMES').
 * Потрібно, щоб тести брали дані прямо з коду і не дублювали їх.
 */
export function extractLiteral(relFromRoot, name) {
  const src = fs.readFileSync(path.join(ROOT, relFromRoot), 'utf8');
  const m = new RegExp('\\b' + name + '\\s*=\\s*([\\[{])').exec(src);
  if (!m) throw new Error(`Не знайдено «${name} = …» у ${relFromRoot}`);
  const start = m.index + m[0].length - 1;
  let depth = 0;
  let quote = null;
  for (let j = start; j < src.length; j++) {
    const ch = src[j];
    if (quote) {
      if (ch === '\\') j++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        const value = vm.runInNewContext('(' + src.slice(start, j + 1) + ')');
        return JSON.parse(JSON.stringify(value));
      }
    }
  }
  throw new Error(`Не вдалося розібрати «${name}» у ${relFromRoot}`);
}

export function readJson(relFromPublic) {
  return JSON.parse(fs.readFileSync(path.join(PUBLIC, relFromPublic), 'utf8').replace(/^﻿/, ''));
}
