/**
 * T08 카드 2~3 — 등록 화면. 비공개 자료는 어떤 경우에도 이 파일에 넣지 않는다.
 * SimpleWebAuthn은 검증을 서버에서 수행하고, 브라우저는 표준 WebAuthn API만 호출한다.
 */
(() => {
  const button = document.getElementById('checkPrivateAccess');
  const output = document.getElementById('privateResult');
  const form = document.getElementById('passkeyRegisterForm');
  const cancelButton = document.getElementById('cancelPasskeyRegister');
  const status = document.getElementById('registrationResult');
  const submit = document.getElementById('createPasskey');
  let currentTransaction = null;
  let cancelled = false;

  function setStatus(message, type = '') {
    status.textContent = message;
    status.className = `private-result ${type}`;
  }
  function decodeB64(input) {
    const s = input.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(s.padEnd(Math.ceil(s.length / 4) * 4, '='));
    return Uint8Array.from(decoded, char => char.charCodeAt(0));
  }
  function encodeB64(buffer) {
    const bytes = new Uint8Array(buffer);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function prepareCreationOptions(options) {
    return {
      ...options,
      challenge: decodeB64(options.challenge),
      user: { ...options.user, id: decodeB64(options.user.id) },
      excludeCredentials: (options.excludeCredentials ?? []).map(item => ({
        ...item, id: decodeB64(item.id),
      })),
    };
  }
  function serializeCredential(credential) {
    if (typeof credential.toJSON === 'function') return credential.toJSON();
    const response = credential.response;
    return {
      id: credential.id,
      rawId: encodeB64(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      response: {
        clientDataJSON: encodeB64(response.clientDataJSON),
        attestationObject: encodeB64(response.attestationObject),
        transports: response.getTransports?.() ?? [],
      },
      clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
    };
  }
  async function api(endpoint, body) {
    const reply = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await reply.json();
    if (!reply.ok) throw new Error(`${reply.status} ${data.error || 'request_failed'}`);
    return data;
  }
  async function cancelPending(transactionId) {
    if (!transactionId) return;
    try { await api('/api/passkeys/register/cancel', {transactionId}); }
    catch { /* 만료된 등록 질문은 서버에서 자동 정리된다. */ }
  }
  cancelButton?.addEventListener('click', async () => {
    cancelled = true;
    cancelButton.disabled = true;
    if (currentTransaction) await cancelPending(currentTransaction);
    setStatus('등록을 취소했습니다. 계정이나 패스키는 저장되지 않았습니다.', 'is-denied');
  });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!window.PublicKeyCredential || !navigator.credentials?.create) {
      setStatus('이 브라우저에서는 패스키를 지원하지 않습니다. 최신 Chrome/Edge 또는 스마트폰 브라우저를 사용하세요.', 'is-error');
      return;
    }
    submit.disabled = true;
    cancelButton.disabled = false;
    cancelled = false;
    currentTransaction = null;
    setStatus('서버에서 등록용 일회용 질문을 생성하고 있습니다…');
    try {
      const name = document.getElementById('passkeyNickname').value;
      const label = document.getElementById('passkeyLabel').value;
      const started = await api('/api/passkeys/register/options', {nickname: name, label});
      currentTransaction = started.transactionId;
      if (cancelled) { await cancelPending(currentTransaction); return; }
      setStatus('기기의 패스키 생성 창을 확인하세요. 취소하려면 기기의 취소 버튼을 누르면 됩니다.');
      const credential = await navigator.credentials.create({
        publicKey: prepareCreationOptions(started.options),
      });
      if (!credential || cancelled) { await cancelPending(currentTransaction); return; }
      cancelButton.disabled = true; // 검증이 시작된 뒤에는 완료를 취소했다고 표시하지 않는다.
      const saved = await api('/api/passkeys/register/verify', {
        transactionId: currentTransaction,
        credential: serializeCredential(credential),
      });
      currentTransaction = null;
      setStatus(`등록 완료: ${saved.nickname} / ${saved.label}. 서버에 공개키가 저장됐습니다.`, 'is-denied');
      window.dispatchEvent(new Event('t08:passkey-registered'));
      document.getElementById('registrationSuccess').hidden = false;
    } catch (error) {
      await cancelPending(currentTransaction);
      currentTransaction = null;
      const text = String(error?.message ?? error);
      if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') {
        setStatus('패스키 등록을 취소했거나 제한 시간이 지났습니다. 서버에 계정과 공개키가 생성되지 않았습니다.', 'is-denied');
      } else if (text.includes('nickname_taken')) {
        setStatus('이미 존재하는 계정 이름입니다. 다른 이름을 선택하거나 다음 단계의 로그인 기능을 사용하세요.', 'is-error');
      } else {
        setStatus(`등록 실패: ${text}. 문제가 계속되면 HTTPS와 D1 테이블을 확인하세요.`, 'is-error');
      }
    } finally {
      submit.disabled = false;
      cancelButton.disabled = true;
    }
  });

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
        output.textContent = `${response.status} — 비공개 자료 요청이 서버에서 거절되었습니다. (T08-C16·C17 검사)`;
      } else if (response.ok) {
        output.classList.add('is-denied');
        output.textContent = 'HTTP 200 — 인증된 세션으로만 서버의 비공개 API가 열렸습니다.';
      } else {
        output.classList.add('is-error');
        output.textContent = `HTTP ${response.status}. 세션 상태와 서버 라우팅을 확인하세요.`;
      }
    } catch {
      output.classList.add('is-error');
      output.textContent = 'Workers 서버에 연결할 수 없습니다.';
    } finally { button.disabled = false; }
  });
})();
