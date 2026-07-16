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

chrome.runtime.onInstalled.addListener(() => { ensureUpdateAlarm(); checkUpdate(); });
chrome.runtime.onStartup.addListener(() => { ensureUpdateAlarm(); checkUpdate(); });
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
