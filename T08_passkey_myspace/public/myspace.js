/** T08 카드 1 — 브라우저는 절대 비공개 콘텐츠를 사전에 포함하지 않는다. */
(() => {
  const button = document.getElementById('checkPrivateAccess');
  const output = document.getElementById('privateResult');
  if (!button || !output) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    output.className = 'private-result';
    output.textContent = '비공개 API에 요청 중…';
    try {
      const response = await fetch('/api/private/items', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 401 || response.status === 403) {
        output.classList.add('is-denied');
        output.textContent = `${response.status} — 인증되지 않은 요청이 서버에서 거절되었습니다. (T08-C16·C17 검사)`;
      } else {
        // 인증 기능이 구현되지 않은 1단계에서는 200을 기대하지 않는다.
        output.classList.add('is-error');
        output.textContent = `예상하지 못한 HTTP ${response.status} 응답입니다. 서버 라우팅을 확인하세요.`;
      }
    } catch {
      output.classList.add('is-error');
      output.textContent = '서버에 연결할 수 없습니다. GitHub Pages가 아닌 Workers 개발 서버에서 실행하세요.';
    } finally {
      button.disabled = false;
    }
  });
})();
