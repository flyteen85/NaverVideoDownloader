// Service worker — 탭별 영상 목록 저장(storage.session), 배지 갱신, 다운로드 처리
const keyOf = (tabId) => 'videos_' + tabId;

// ────────────────────────────────────────────────────────────────
// 자동 업데이트 확인 (GitHub Releases)
//  ▸ 아래 REPO 를 본인 저장소 "아이디/저장소이름" 으로 바꾸세요.
//    예: 'flyteen85/naver-video-downloader'
//  ▸ GitHub에서 새 Release(태그 v1.0.1 등)를 올리고 zip을 첨부하면,
//    설치된 확장들이 12시간마다 확인해 새 버전 배너를 띄웁니다.
//  ▸ GitHub API는 CORS를 허용하므로 별도 host 권한/경고가 필요 없습니다.
// ────────────────────────────────────────────────────────────────
const REPO = 'flyteen85/NaverVideoDownloader';
const UPDATE_ALARM = 'nvd-update-check';

chrome.runtime.onInstalled.addListener(() => { ensureUpdateAlarm(); checkUpdate(); refreshAllTabs(); });
chrome.runtime.onStartup.addListener(() => { ensureUpdateAlarm(); checkUpdate(); refreshAllTabs(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === UPDATE_ALARM) checkUpdate(); });

function ensureUpdateAlarm() {
  chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: 720 }); // 12시간
}

async function checkUpdate() {
  if (!REPO || REPO.startsWith('YOUR_GITHUB_ID')) return; // 저장소 미설정 시 건너뜀
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!r.ok) return;
    const j = await r.json();
    const latest = String(j.tag_name || '').replace(/^v/i, '').trim();
    if (!latest) return;
    const current = chrome.runtime.getManifest().version;
    await chrome.storage.local.set({
      nvdUpdate: {
        latest,
        current,
        hasUpdate: isNewer(latest, current),
        url: j.html_url || `https://github.com/${REPO}/releases/latest`,
        checkedAt: Date.now(),
      },
    });
  } catch (e) { /* 네트워크 오류 등은 조용히 무시 */ }
}

// semver 비교: a가 b보다 높으면 true (1.2.0 > 1.1.9)
function isNewer(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────
// 아이콘 점등/소등
//  네이버 도메인에서는 컬러 아이콘 + 클릭 가능,
//  그 외 도메인에서는 흑백 아이콘 + 클릭 비활성(패널이 열리지 않음).
//  ※ tabs 권한 없이 동작한다. *.naver.com host 권한 덕에 네이버 탭에서만
//    tab.url 이 보이고, 다른 도메인은 URL 자체가 가려져 자연스럽게 소등된다.
// ────────────────────────────────────────────────────────────────
const ICON_ON = {
  16: 'icons/icon16.png', 24: 'icons/icon24.png', 32: 'icons/icon32.png',
  48: 'icons/icon48.png', 128: 'icons/icon128.png',
};
const ICON_OFF = {
  16: 'icons/icon16-gray.png', 24: 'icons/icon24-gray.png', 32: 'icons/icon32-gray.png',
  48: 'icons/icon48-gray.png', 128: 'icons/icon128-gray.png',
};
const TITLE_ON = '네이버 동영상 다운로더 (클릭하여 패널 열기)';
const TITLE_OFF = '네이버 동영상 다운로더 — 네이버 블로그·카페·포스트에서만 사용할 수 있어요';

// 실제로 동작하는 곳만 화이트리스트로 허용한다(폐쇄적 허용).
// 네이버 홈·메일·메모·지도·쇼핑 등에서는 스마트에디터 영상이 없으므로 소등한다.
// manifest의 host_permissions / content_scripts.matches 와 반드시 같은 목록을 유지할 것.
const SUPPORTED_HOSTS = new Set([
  'blog.naver.com', 'm.blog.naver.com',
  'cafe.naver.com', 'm.cafe.naver.com',
  'post.naver.com', 'm.post.naver.com',
]);

function isSupportedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return SUPPORTED_HOSTS.has(u.hostname); // 정확히 일치하는 호스트만
  } catch (e) {
    return false;
  }
}

async function refreshAction(tabId) {
  let url = '';
  try {
    const tab = await chrome.tabs.get(tabId);
    url = tab.url || ''; // 권한 없는 도메인은 빈 값 → 소등
  } catch (e) {
    return; // 탭이 이미 닫힌 경우 등
  }
  const on = isSupportedUrl(url);
  try {
    await chrome.action.setIcon({ tabId, path: on ? ICON_ON : ICON_OFF });
    await chrome.action.setTitle({ tabId, title: on ? TITLE_ON : TITLE_OFF });
    if (on) await chrome.action.enable(tabId);
    else await chrome.action.disable(tabId);
  } catch (e) {}
}

async function refreshAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) if (t.id >= 0) refreshAction(t.id);
  } catch (e) {}
}

chrome.tabs.onActivated.addListener(({ tabId }) => refreshAction(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status || info.url) refreshAction(tabId);
});

// 툴바 아이콘 클릭 → 해당 탭의 인페이지 드로어를 토글
chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id < 0) return;
  chrome.tabs.sendMessage(tab.id, { type: 'NVD_TOGGLE_PANEL' }).catch(() => {
    // 네이버 도메인이 아니어서 content script가 없는 경우 등은 무시
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'NVD_VIDEO_FOUND' && sender.tab && sender.tab.id >= 0) {
    addVideo(sender.tab.id, msg.video).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'NVD_CHECK_UPDATE') {
    checkUpdate().then(async () => {
      const { nvdUpdate } = await chrome.storage.local.get('nvdUpdate');
      sendResponse(nvdUpdate || null);
    });
    return true;
  }

  if (msg.type === 'NVD_GET') {
    chrome.storage.session.get(keyOf(msg.tabId)).then((o) => {
      sendResponse({ videos: o[keyOf(msg.tabId)] || [] });
    });
    return true;
  }

  if (msg.type === 'NVD_DOWNLOAD') {
    chrome.downloads.download({
      url: msg.url,
      filename: 'NaverVideo/' + msg.filename,
      saveAs: false,
      conflictAction: 'uniquify',
    }).then(
      (id) => sendResponse({ ok: true, id }),
      (err) => sendResponse({ ok: false, error: String(err && err.message || err) })
    );
    return true;
  }
});

async function addVideo(tabId, video) {
  if (!video || !video.videoId || !Array.isArray(video.qualities)) return;
  const k = keyOf(tabId);
  const o = await chrome.storage.session.get(k);
  const list = o[k] || [];
  const i = list.findIndex((x) => x.videoId === video.videoId);
  if (i >= 0) list[i] = merge(list[i], video);
  else list.push(video);
  await chrome.storage.session.set({ [k]: list });
  setBadge(tabId, list.length);
}

// 새로 들어온 정보 우선(서명 URL이 더 최신), 비어 있는 필드는 기존 값으로 보충
function merge(oldV, newV) {
  const v = { ...oldV, ...newV };
  v.title = newV.title || oldV.title;
  v.thumbnail = newV.thumbnail || oldV.thumbnail;
  v.duration = newV.duration || oldV.duration;
  const heights = new Set(newV.qualities.map((q) => q.height || q.label));
  v.qualities = [...newV.qualities];
  for (const q of oldV.qualities || []) {
    if (!heights.has(q.height || q.label)) v.qualities.push(q);
  }
  v.qualities.sort((a, b) => (b.height - a.height) || (b.size - a.size));
  return v;
}

function setBadge(tabId, count) {
  chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#03C75A' }).catch(() => {});
  chrome.action.setBadgeTextColor && chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' }).catch(() => {});
}

// 탭이 닫히거나 새 페이지로 이동하면 목록 초기화
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(keyOf(tabId));
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    chrome.storage.session.remove(keyOf(tabId));
    setBadge(tabId, 0);
  }
});
