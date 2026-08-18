// ── 브라우저 API 스텁 (헤드리스 로직 테스트용) ──
const ctxStub = new Proxy({}, {
  get(t, p) { if (p in t) return t[p]; return () => {}; },
  set(t, p, v) { t[p] = v; return true; }
});
const elStub = () => ({
  style: {}, textContent: '', innerHTML: '', title: '', className: '',
  width: 0, height: 0,
  appendChild() {}, addEventListener() {}, onclick: null,
  classList: { toggle() {} },
  getContext: () => ctxStub,
});
globalThis.document = {
  getElementById: (() => { const cache = {}; return id => cache[id] ||= elStub(); })(),
  createElement: () => elStub(),
  querySelectorAll: () => [],
};
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => {};
globalThis.setTimeout_real = setTimeout;
globalThis.setTimeout = () => {};
globalThis.cv_stub = true;
globalThis.location = { search:'', protocol:'http:', host:'localhost', origin:'http://localhost' };
