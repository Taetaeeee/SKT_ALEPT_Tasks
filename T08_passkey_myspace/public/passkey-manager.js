/** T08 card 4: authenticated passkey listing and user-confirmed revocation UI. */
(() => {
  const section = document.getElementById('authenticatedSpace');
  const list = document.getElementById('passkeyList');
  const refresh = document.getElementById('refreshPasskeys');
  const status = document.getElementById('passkeyManagementResult');
  if (!section || !list || !refresh || !status) return;

  let generation = 0;
  let busy = false;

  function message(value, type = '') {
    status.textContent = value;
    status.className = `private-result ${type}`;
  }
  const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  async function api(path, init = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json', ...(init.headers || {}) }, ...init,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${response.status} ${data.error || 'request_failed'}`);
    return data;
  }
  function render(passkeys) {
    list.replaceChildren();
    if (!passkeys.length) {
      const empty = document.createElement('p');
      empty.textContent = '등록된 패스키가 없습니다. 모든 패스키를 잃어버리면 이 계정은 비밀번호로 복구할 수 없습니다.';
      list.append(empty);
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'passkey-list';
    for (const key of passkeys) {
      const li = document.createElement('li');
      li.className = 'passkey-row';
      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = key.label;
      const date = document.createElement('small');
      const epoch = key.registeredAt;
      const validEpoch = Number.isSafeInteger(epoch) && epoch > 0;
      date.textContent = validEpoch
        ? `등록일: ${dateFormatter.format(new Date(epoch * 1000))} (KST)`
        : '등록일 확인 불가';
      info.append(name, date);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost-button passkey-delete';
      remove.textContent = passkeys.length === 1 ? '마지막 패스키 보호' : '삭제';
      remove.disabled = passkeys.length === 1 || busy;
      remove.setAttribute('aria-label', `${key.label} 패스키 삭제`);
      remove.addEventListener('click', () => deleteKey(key));
      li.append(info, remove);
      ul.append(li);
    }
    list.append(ul);
    message(`등록된 패스키 ${passkeys.length}개. 마지막 패스키 삭제는 서버에서도 차단합니다.`, 'is-denied');
  }
  async function reload() {
    if (section.hidden) return;
    const seq = ++generation;
    refresh.disabled = true;
    message('서버에서 현재 계정의 패스키 목록을 조회 중입니다…');
    try {
      const data = await api('/api/passkeys/manage');
      if (seq !== generation || section.hidden) return;
      render(Array.isArray(data.passkeys) ? data.passkeys : []);
    } catch (err) {
      if (seq !== generation || section.hidden) return;
      list.replaceChildren();
      message(`패스키 목록을 읽지 못했습니다: ${err.message}. 로그인 상태를 확인하세요.`, 'is-error');
    } finally {
      if (seq === generation) refresh.disabled = false;
    }
  }
  async function deleteKey(key) {
    if (busy || section.hidden) return;
    const accepted = window.confirm(
      `"${key.label}" 패스키를 T08 서버에서 삭제할까요?\n삭제 후 모든 기기의 로그인 세션이 종료됩니다.\n먼저 다른 패스키가 실제로 사용 가능한지 확인하세요.`
    );
    if (!accepted) return;
    busy = true;
    refresh.disabled = true;
    message(`${key.label} 삭제 요청 중입니다…`);
    try {
      const data = await api('/api/passkeys/manage/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: key.credentialId }),
      });
      if (!data.deleted || !data.loggedOut) throw new Error('unexpected_server_response');
      list.replaceChildren();
      window.dispatchEvent(new Event('t08:session-revoked'));
    } catch (err) {
      const code = String(err.message);
      if (code.includes('last_passkey_protected')) {
        message('마지막 패스키는 삭제할 수 없습니다. 계정 접근을 보호합니다.', 'is-error');
      } else if (code.includes('recent_login_required')) {
        message('삭제하려면 최근 10분 안에 패스키로 다시 로그인해야 합니다.', 'is-error');
      } else if (code.includes('passkey_not_found')) {
        message('현재 계정에 없는 패스키입니다. 목록을 다시 확인하세요.', 'is-error');
      } else {
        message(`삭제 결과를 확인할 수 없습니다: ${code}. 새로고침하여 실제 계정 상태를 확인하세요.`, 'is-error');
      }
      await reload();
    } finally { busy = false; refresh.disabled = false; }
  }
  refresh.addEventListener('click', reload);
  window.addEventListener('t08:auth-changed', () => {
    if (section.hidden) {
      generation++;
      list.replaceChildren();
      return;
    }
    reload();
  });
  window.addEventListener('t08:passkey-registered', () => {
    if (!section.hidden) reload();
  });
})();
