/** T08 카드 3: WebAuthn assertion 로그인 + 서버 세션 상태 + 서버에서만 내려 받는 비공개 자료. */
(() => {
  const loginButton = document.getElementById('loginPasskey');
  const logoutButton = document.getElementById('logoutPasskey');
  const status = document.getElementById('loginResult');
  const privateState = document.getElementById('privateState');
  const authenticatedSpace = document.getElementById('authenticatedSpace');
  const authenticatedNickname = document.getElementById('authenticatedNickname');
  const privateItems = document.getElementById('privateItems');
  const nicknameInput = document.getElementById('passkeyNickname');
  const registerHint = document.getElementById('registerModeHint');
  const registerTitle = document.getElementById('passkeyRegisterTitle');
  if (!loginButton || !logoutButton || !status || !privateItems) return;

  function message(text, type = '') {
    status.textContent = text;
    status.className = `private-result ${type}`;
  }
  function decodedBase64Url(text) {
    const data = text.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(data.padEnd(Math.ceil(data.length / 4) * 4, '='));
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }
  function encodedBase64Url(buffer) {
    const data = new Uint8Array(buffer);
    let output = '';
    for (const byte of data) output += String.fromCharCode(byte);
    return btoa(output).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function optionsForBrowser(options) {
    return {
      ...options,
      challenge: decodedBase64Url(options.challenge),
      ...(Array.isArray(options.allowCredentials) && options.allowCredentials.length ? {
        allowCredentials: options.allowCredentials.map(cred => ({
          ...cred, id: decodedBase64Url(cred.id),
        })),
      } : { allowCredentials: undefined }),
    };
  }
  function serializeAssertion(credential) {
    if (typeof credential.toJSON === 'function') return credential.toJSON();
    const response = credential.response;
    return {
      id: credential.id,
      rawId: encodedBase64Url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      response: {
        clientDataJSON: encodedBase64Url(response.clientDataJSON),
        authenticatorData: encodedBase64Url(response.authenticatorData),
        signature: encodedBase64Url(response.signature),
        userHandle: response.userHandle ? encodedBase64Url(response.userHandle) : null,
      },
      clientExtensionResults: credential.getClientExtensionResults?.() || {},
    };
  }
  async function post(path, body = {}) {
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`${response.status} ${data.error || 'request_failed'}`);
    return data;
  }
  async function fetchJSON(path) {
    const response = await fetch(path, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  function setGuest() {
    loginButton.hidden = false;
    logoutButton.hidden = true;
    privateState.textContent = '🔒 비공개 · 잠김';
    authenticatedSpace.hidden = true;
    privateItems.replaceChildren();
    nicknameInput.readOnly = false;
    nicknameInput.value = '';
    window.dispatchEvent(new Event('t08:auth-changed'));
    registerTitle.textContent = '패스키 등록';
    registerHint.textContent = '새 계정 생성 시 가상 이름을 입력하세요. 이미 등록된 계정의 패스키 추가는 로그인 후 가능합니다.';
  }
  function setLoggedIn(nickname) {
    loginButton.hidden = true;
    logoutButton.hidden = false;
    privateState.textContent = '🔓 비공개 · 인증됨';
    authenticatedSpace.hidden = false;
    authenticatedNickname.textContent = `현재 인증된 가상 계정: ${nickname}`;
    nicknameInput.value = nickname;
    nicknameInput.readOnly = true;
    window.dispatchEvent(new Event('t08:auth-changed'));
    registerTitle.textContent = '현재 계정에 패스키 추가';
    registerHint.textContent = '현재 로그인된 계정에만 패스키를 추가합니다. 패스키 이름을 새로 입력하세요.';
  }
  async function loadItems() {
    const data = await fetchJSON('/api/private/items');
    privateItems.replaceChildren();
    if (!Array.isArray(data.items) || !data.items.length) {
      const empty = document.createElement('p');
      empty.textContent = '현재 등록된 비공개 자료가 없습니다. 추후 D1 Console에서 가상 자료 3건을 추가합니다.';
      privateItems.append(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'private-item-list';
    for (const item of data.items) {
      const article = document.createElement('article');
      article.className = 'private-item';
      const title = document.createElement('h5');
      title.textContent = item.title;
      const body = document.createElement('p');
      body.textContent = item.body;
      article.append(title, body);
      list.append(article);
    }
    privateItems.append(list);
  }
  async function restoreSession() {
    try {
      const info = await fetchJSON('/api/auth/status');
      if (info.authenticated && typeof info.nickname === 'string') {
        setLoggedIn(info.nickname);
        await loadItems();
        message(`인증된 계정 ${info.nickname}의 서버 자료만 표시합니다.`, 'is-denied');
      } else {
        setGuest();
        message('패스키로 로그인하면 서버에 저장된 본인 자료만 열립니다.');
      }
    } catch {
      setGuest();
      message('인증 상태를 확인할 수 없습니다. 잠금 상태를 유지합니다.', 'is-error');
    }
  }
  loginButton.addEventListener('click', async () => {
    if (!window.PublicKeyCredential || !navigator.credentials?.get) {
      message('이 브라우저에서 패스키를 사용할 수 없습니다.', 'is-error');
      return;
    }
    loginButton.disabled = true;
    let transactionId;
    try {
      message('서버에서 로그인용 새 challenge를 생성하고 있습니다…');
      const started = await post('/api/passkeys/login/options');
      transactionId = started.transactionId;
      message('Bitwarden 또는 패스키 관리자의 승인 창을 확인하세요.');
      const credential = await navigator.credentials.get({publicKey: optionsForBrowser(started.options)});
      if (!credential) throw new Error('credential_not_selected');
      const loggedIn = await post('/api/passkeys/login/verify', {
        transactionId,
        credential: serializeAssertion(credential),
      });
      setLoggedIn(loggedIn.nickname);
      await loadItems();
      message(`${loggedIn.nickname} 패스키 서명 검증 성공. 서버 세션이 생성됐습니다.`, 'is-denied');
    } catch (e) {
      setGuest();
      const errorText = String(e?.message ?? e);
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') {
        message('패스키 선택을 취소했거나 제한 시간이 지났습니다.', 'is-error');
      } else {
        message(`로그인 실패: ${errorText}. 다시 로그인하면 새로운 질문을 받습니다.`, 'is-error');
      }
    } finally { loginButton.disabled = false; }
  });
  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      await post('/api/auth/logout');
      setGuest();
      message('로그아웃 완료: 서버 세션이 폐기됐습니다. 비공개 API는 다시 401입니다.', 'is-denied');
    } catch {
      message('로그아웃 요청에 실패했습니다. 서버 상태를 확인하세요.', 'is-error');
    } finally { logoutButton.disabled = false; }
  });
  window.addEventListener('t08:session-revoked', () => {
    setGuest();
    message('패스키 삭제 완료. 보안을 위해 기존 세션을 종료했습니다. 남은 패스키로 다시 로그인하세요.', 'is-denied');
  });
  restoreSession();
})();
