// MAIN world — 페이지의 fetch/XHR을 후킹해 네이버 VOD 응답(MPD/JSON)을 가로채고,
// 본문에서 vid/inkey를 찾아 재생 전에도 영상 정보를 미리 가져온다.
(() => {
  if (window.__nvdHooked) return;
  window.__nvdHooked = true;

  const post = (url, body) => {
    if (!body || body.length > 5_000_000) return;
    try { window.postMessage({ __nvd: 'capture', url: String(url), body }, '*'); } catch (e) {}
  };

  const isCandidate = (url) => {
    try {
      const u = new URL(url, location.href);
      if (!/(naver\.com|pstatic\.net|naver\.net)$/.test(u.hostname)) return false;
      return /(^|[?&])key=/.test(u.search) || u.pathname.includes('/vod/');
    } catch (e) { return false; }
  };

  // ---- fetch 후킹 ----
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const p = origFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isCandidate(url)) {
        p.then((res) => {
          try { res.clone().text().then((t) => post(res.url || url, t)).catch(() => {}); } catch (e) {}
        }).catch(() => {});
      }
    } catch (e) {}
    return p;
  };

  // ---- XHR 후킹 ----
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;
  XHR.open = function (method, url, ...rest) {
    this.__nvdUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XHR.send = function (...args) {
    if (this.__nvdUrl && isCandidate(this.__nvdUrl)) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') post(this.responseURL || this.__nvdUrl, this.responseText);
          else if (this.responseType === 'json' && this.response) post(this.responseURL || this.__nvdUrl, JSON.stringify(this.response));
        } catch (e) {}
      });
    }
    return origSend.apply(this, args);
  };

  // ---- 본문에서 vid/inkey를 찾아 미리 조회 (재생하지 않아도 목록 확보) ----
  const probed = new Set();
  async function probe(vid, inkey) {
    const k = vid + '|' + inkey;
    if (probed.has(k)) return;
    probed.add(k);
    try {
      const r = await fetch(`https://apis.naver.com/rmcnmv/rmcnmv/vod/play/v2.0/${vid}?key=${inkey}`, { credentials: 'omit' });
      if (r.ok) post(r.url, await r.text());
    } catch (e) {}
  }

  function extractPairs(text) {
    if (!text || text.length > 3_000_000) return;
    const re = /["']?vid["']?\s*[:=]\s*["']([\w-]{10,})["'][\s\S]{0,300}?["']?in[kK]ey["']?\s*[:=]\s*["']([\w-]{10,})["']/g;
    const re2 = /["']?in[kK]ey["']?\s*[:=]\s*["']([\w-]{10,})["'][\s\S]{0,300}?["']?vid["']?\s*[:=]\s*["']([\w-]{10,})["']/g;
    let m;
    while ((m = re.exec(text))) probe(m[1], m[2]);
    while ((m = re2.exec(text))) probe(m[2], m[1]);
  }

  function scan() {
    try {
      // 스마트에디터 동영상 모듈 (블로그/포스트/카페)
      document.querySelectorAll('script.__se_module_data, [data-module], [data-module-v2]').forEach((el) => {
        const dm = el.getAttribute('data-module') || el.getAttribute('data-module-v2') || '';
        if (!/video/i.test(dm)) return;
        try {
          const j = JSON.parse(dm);
          const d = (j && j.data) || {};
          const vid = d.vid || d.videoId;
          const inkey = d.inkey || d.inKey;
          if (vid && inkey) probe(vid, inkey);
          else extractPairs(dm);
        } catch (e) { extractPairs(dm); }
      });
      // 인라인 스크립트 폴백
      document.querySelectorAll('script:not([src])').forEach((s) => extractPairs(s.textContent));
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }
  window.addEventListener('load', scan);
  setTimeout(scan, 1500);
  setTimeout(scan, 4000);

  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.__nvd === 'rescan') {
      probed.clear();
      scan();
    }
  });
})();
