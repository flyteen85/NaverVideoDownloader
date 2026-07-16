// ISOLATED world — MAIN world가 가로챈 응답을 파싱해 정규화하고 백그라운드로 전달한다.
(() => {
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.__nvd !== 'capture' || typeof d.body !== 'string') return;
    try { handle(d.url, d.body); } catch (err) {}
  });

  // 팝업의 "다시 검색" 요청을 MAIN world로 중계
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'NVD_RESCAN') {
      window.postMessage({ __nvd: 'rescan' }, '*');
    }
  });

  function handle(url, body) {
    const t = body.trim();
    let video = null;
    if (t.startsWith('<')) video = parseMpd(url, t);
    else if (t.startsWith('{')) video = parseJson(url, t);
    if (!video || !video.qualities.length) return;

    if (!video.thumbnail) video.thumbnail = domThumbnail();
    if (!video.title) video.title = cleanTitle(document.title);
    video.pageUrl = location.href;
    video.capturedAt = Date.now();

    chrome.runtime.sendMessage({ type: 'NVD_VIDEO_FOUND', video }).catch(() => {});
  }

  // ---------- MPD (DASH manifest) ----------
  function parseMpd(url, xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const mpd = doc.documentElement;
    if (!mpd || mpd.localName !== 'MPD') return null;

    const videoId = mpd.getAttribute('nvod:videoId') || attrByLocal(mpd, 'videoId') || hashOf(url);
    const duration = isoDuration(mpd.getAttribute('mediaPresentationDuration'));

    let title = null;
    let thumbnail = null;
    // SupplementalProperty(urn:naver:vod:information) 안의 제목/커버 탐색
    for (const el of doc.getElementsByTagName('*')) {
      const ln = el.localName || '';
      const text = (el.textContent || '').trim();
      if (!title && /^(title|subject|name)$/i.test(ln) && text && !text.startsWith('<')) title = text;
      if (!thumbnail && /(cover|thumb|image|poster)/i.test(ln)) {
        const cand = el.getAttribute('source') || el.getAttribute('src') || el.getAttribute('url') || (/^https?:/.test(text) ? text : null);
        if (cand) thumbnail = cand;
      }
    }

    const qualities = [];
    for (const rep of doc.querySelectorAll('Representation')) {
      const adap = rep.closest('AdaptationSet');
      const mime = rep.getAttribute('mimeType') || (adap && adap.getAttribute('mimeType')) || '';
      if (mime && !/mp4/.test(mime)) continue; // mp2t(HLS)는 제외, 직접 다운로드 가능한 mp4만
      const base = rep.querySelector('BaseURL');
      const src = base && base.textContent.trim();
      if (!src) continue;
      const width = parseInt(rep.getAttribute('width') || '0', 10);
      const height = parseInt(rep.getAttribute('height') || '0', 10);
      const bandwidth = parseInt(rep.getAttribute('bandwidth') || '0', 10);
      qualities.push({
        url: src,
        width, height,
        label: height ? `${height}p` : (bandwidth ? `${Math.round(bandwidth / 1000)}k` : '기본'),
        size: bandwidth && duration ? Math.round(bandwidth * duration / 8) : 0,
        sizeEstimated: true,
      });
    }
    return normalize({ videoId, title, thumbnail, duration, qualities });
  }

  // ---------- 재생 API JSON ----------
  function parseJson(url, text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    const list = o && o.videos && Array.isArray(o.videos.list) ? o.videos.list : null;
    if (!list || !list.length) return null;
    const meta = o.meta || {};

    const qualities = [];
    let duration = Number(meta.duration) || 0;
    for (const v of list) {
      if (!v || !v.source) continue;
      const eo = v.encodingOption || {};
      const height = parseInt(eo.height || 0, 10);
      qualities.push({
        url: v.source,
        width: parseInt(eo.width || 0, 10),
        height,
        label: height ? `${height}p` : (eo.name || '기본'),
        size: Number(v.size) || 0,
        sizeEstimated: false,
      });
      if (!duration && v.duration) duration = Number(v.duration) || 0;
    }

    let thumbnail = (meta.cover && meta.cover.source) || null;
    if (!thumbnail && o.thumbnails && Array.isArray(o.thumbnails.list) && o.thumbnails.list.length) {
      thumbnail = o.thumbnails.list[0].source || null;
    }

    return normalize({
      videoId: meta.masterVideoId || (list[0] && list[0].id) || hashOf(url),
      title: meta.subject || null,
      thumbnail,
      duration,
      qualities,
    });
  }

  // ---------- 공통 ----------
  function normalize(v) {
    // 해상도(height) 기준 중복 제거, 높은 화질 우선 정렬
    const byHeight = new Map();
    for (const q of v.qualities) {
      const k = q.height || q.label;
      const prev = byHeight.get(k);
      if (!prev || (!q.sizeEstimated && prev.sizeEstimated)) byHeight.set(k, q);
    }
    v.qualities = [...byHeight.values()].sort((a, b) => (b.height - a.height) || (b.size - a.size));
    return v;
  }

  function attrByLocal(el, local) {
    for (const a of el.attributes) if (a.localName === local) return a.value;
    return null;
  }

  function isoDuration(s) {
    if (!s) return 0;
    const m = s.match(/PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!m) return 0;
    return (parseFloat(m[1]) || 0) * 3600 + (parseFloat(m[2]) || 0) * 60 + (parseFloat(m[3]) || 0);
  }

  function domThumbnail() {
    const v = document.querySelector('video[poster]');
    if (v) {
      const p = v.getAttribute('poster');
      if (p) return p;
    }
    for (const el of document.querySelectorAll('[class*="poster" i]')) {
      const img = el.tagName === 'IMG' ? el : el.querySelector('img');
      if (img && img.src) return img.src;
      try {
        const bg = getComputedStyle(el).backgroundImage;
        const m = bg && bg.match(/url\(["']?(.+?)["']?\)/);
        if (m && m[1] && /^https?:/.test(m[1])) return m[1];
      } catch (e) {}
    }
    return null;
  }

  function cleanTitle(t) {
    return (t || '').replace(/\s*[:|-]\s*네이버\s*(블로그|카페|포스트|TV)?\s*$/i, '').trim() || '네이버 동영상';
  }

  function hashOf(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return 'v' + h.toString(36);
  }
})();
