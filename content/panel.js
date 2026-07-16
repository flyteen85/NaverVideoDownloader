// 인페이지 드로어 — 툴바 아이콘 클릭 시 오른쪽 끝에서 슬라이드 인/아웃하는 패널.
// 네이티브 사이드 패널과 달리 열림/닫힘 애니메이션과 바깥 클릭 닫기를 직접 제어한다.
(() => {
  if (window.top !== window) return;      // 최상위 프레임에서만 동작
  if (window.__nvdPanel) return;
  window.__nvdPanel = true;

  const DURATION = 340;                    // ms, CSS transition과 일치
  let host, scrim, frame, open = false, animating = false;

  function build() {
    host = document.createElement('div');
    host.id = '__nvd-panel-host';
    // 페이지 CSS의 영향을 차단하기 위해 Shadow DOM 사용
    const root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host, * { box-sizing: border-box; }
      .scrim {
        position: fixed; inset: 0;
        background: rgba(8, 12, 22, 0.28);
        backdrop-filter: blur(1.5px);
        -webkit-backdrop-filter: blur(1.5px);
        opacity: 0;
        transition: opacity ${DURATION}ms ease;
        z-index: 2147483646;
      }
      .scrim.show { opacity: 1; }
      .frame {
        position: fixed; top: 0; right: 0;
        height: 100vh; height: 100dvh;
        width: 400px; max-width: 92vw;
        border: none;
        background: transparent;
        color-scheme: normal;
        transform: translateX(105%);
        transition: transform ${DURATION}ms cubic-bezier(0.22, 0.61, 0.36, 1);
        border-radius: 20px 0 0 20px;
        box-shadow: -18px 0 48px rgba(0, 0, 0, 0.45);
        z-index: 2147483647;
        will-change: transform;
      }
      .frame.show { transform: translateX(0); }
      @media (prefers-reduced-motion: reduce) {
        .scrim, .frame { transition-duration: 0ms; }
      }
    `;

    scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.addEventListener('click', close);

    frame = document.createElement('iframe');
    frame.className = 'frame';
    frame.setAttribute('allow', 'autoplay');
    frame.src = chrome.runtime.getURL('popup/popup.html');

    root.append(style, scrim, frame);
    (document.body || document.documentElement).appendChild(host);
  }

  function show() {
    if (open) return;
    if (!host) build();
    open = true;
    animating = true;
    // reflow 후 클래스 추가 → 트랜지션 발동
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrim.classList.add('show');
        frame.classList.add('show');
      });
    });
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { animating = false; }, DURATION);
  }

  function close() {
    if (!open || !host) return;
    open = false;
    animating = true;
    scrim.classList.remove('show');
    frame.classList.remove('show');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => { animating = false; }, DURATION);
  }

  function toggle() {
    if (animating) return;
    open ? close() : show();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  }

  // 아이콘 클릭(백그라운드) 및 iframe 내부의 닫기 요청 처리
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'NVD_TOGGLE_PANEL') toggle();
  });

  // iframe(팝업) 안에서 보낸 닫기 메시지
  window.addEventListener('message', (e) => {
    if (e.data && e.data.__nvdPanel === 'close') close();
  });
})();
