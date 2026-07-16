// 팝업 — 현재 탭에서 감지된 영상 목록을 렌더링하고 다운로드를 트리거한다.
let tabId = null;

const $list = document.getElementById('list');
const $empty = document.getElementById('empty');
const $status = document.getElementById('status-line');
const $rescan = document.getElementById('rescan');
const $toast = document.getElementById('toast');
const $tpl = document.getElementById('card-tpl');

init();

async function init() {
  // 현재 실행 중인 확장 버전 표시
  try {
    document.getElementById('ver-badge').textContent = 'v' + chrome.runtime.getManifest().version;
  } catch (e) {}

  await syncActiveTab();
  await showUpdateBannerIfAny();

  // 이 페이지에서 새 영상이 감지되면 실시간으로 목록에 반영
  chrome.storage.session.onChanged.addListener((changes) => {
    if (tabId != null && ('videos_' + tabId) in changes) load();
  });

  // 닫기 버튼 → 부모(드로어)에 닫기 요청
  const closeBtn = document.getElementById('close');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    parent.postMessage({ __nvdPanel: 'close' }, '*');
  });
}

// 패널 열 때 백그라운드에 즉시 확인을 요청해 업데이트 배너 노출 (타이밍 레이스 방지)
async function showUpdateBannerIfAny() {
  let info = null;
  try {
    info = await chrome.runtime.sendMessage({ type: 'NVD_CHECK_UPDATE' });
  } catch (e) {}
  if (!info) {
    // 라이브 확인 실패 시 이전에 저장된 값으로 폴백
    try { info = (await chrome.storage.local.get('nvdUpdate')).nvdUpdate; } catch (e) {}
  }
  if (!info || !info.hasUpdate) return;
  const banner = document.getElementById('update-banner');
  document.getElementById('ub-ver').textContent = 'v' + info.latest;
  banner.href = info.url;
  banner.classList.remove('hidden');
}

async function syncActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  tabId = tab.id;
  await load();
}

async function load() {
  const res = await chrome.runtime.sendMessage({ type: 'NVD_GET', tabId }).catch(() => null);
  render((res && res.videos) || []);
}

function render(videos) {
  $list.textContent = '';
  if (!videos.length) {
    $empty.classList.remove('hidden');
    $status.textContent = '발견된 영상 없음';
    return;
  }
  $empty.classList.add('hidden');
  $status.textContent = `영상 ${videos.length}개 발견`;

  videos.forEach((v, idx) => {
    const node = $tpl.content.firstElementChild.cloneNode(true);
    node.style.animationDelay = `${idx * 60}ms`;

    // 썸네일
    const img = node.querySelector('.thumb');
    const fallback = node.querySelector('.thumb-fallback');
    if (v.thumbnail) {
      img.src = v.thumbnail;
      img.addEventListener('load', () => fallback.classList.add('hidden'));
      img.addEventListener('error', () => { img.classList.add('hidden'); fallback.classList.remove('hidden'); });
    } else {
      img.classList.add('hidden');
    }

    node.querySelector('.duration').textContent = formatDuration(v.duration);
    node.querySelector('.title').textContent = v.title || '네이버 동영상';
    node.querySelector('.title').title = v.title || '';

    // 화질 칩 (기본: 최고 화질)
    const row = node.querySelector('.quality-row');
    const sizeEl = node.querySelector('.size');
    let selected = 0;
    v.qualities.forEach((q, qi) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (qi === 0 ? ' active' : '');
      chip.textContent = q.label;
      chip.addEventListener('click', () => {
        selected = qi;
        row.querySelectorAll('.chip').forEach((c, ci) => c.classList.toggle('active', ci === qi));
        sizeEl.textContent = formatSize(v.qualities[qi]);
      });
      row.appendChild(chip);
    });
    sizeEl.textContent = formatSize(v.qualities[0]);

    // 다운로드
    const btn = node.querySelector('.download-btn');
    btn.addEventListener('click', async () => {
      const q = v.qualities[selected];
      if (!q) return;
      setBtnState(btn, 'loading');
      const filename = `${sanitize(v.title || 'naver_video')}_${q.label}.mp4`;
      const res = await chrome.runtime.sendMessage({ type: 'NVD_DOWNLOAD', url: q.url, filename }).catch(() => null);
      if (res && res.ok) {
        setBtnState(btn, 'done');
        toast(`다운로드 시작 · ${q.label}`);
        setTimeout(() => setBtnState(btn, 'idle'), 2200);
      } else {
        setBtnState(btn, 'idle');
        toast('다운로드 실패 — 페이지를 새로고침 후 다시 시도해 주세요');
      }
    });

    $list.appendChild(node);
  });
}

function setBtnState(btn, state) {
  btn.querySelector('.ic-down').classList.toggle('hidden', state !== 'idle');
  btn.querySelector('.spinner').classList.toggle('hidden', state !== 'loading');
  btn.querySelector('.ic-check').classList.toggle('hidden', state !== 'done');
  btn.disabled = state === 'loading';
}

// 다시 검색: content script에 재스캔을 요청하고 잠시 후 목록 갱신
$rescan.addEventListener('click', async () => {
  $rescan.classList.add('spinning');
  $status.textContent = '다시 검색 중…';
  try { await chrome.tabs.sendMessage(tabId, { type: 'NVD_RESCAN' }); } catch (e) {}
  setTimeout(async () => {
    await load();
    $rescan.classList.remove('spinning');
  }, 1500);
});

function formatDuration(sec) {
  if (!sec || sec <= 0) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatSize(q) {
  if (!q || !q.size) return '';
  const mb = q.size / (1024 * 1024);
  const text = mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  return (q.sizeEstimated ? '약 ' : '') + text;
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'naver_video';
}

let toastTimer = null;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2400);
}
