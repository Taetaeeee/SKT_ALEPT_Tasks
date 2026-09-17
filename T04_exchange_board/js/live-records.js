const RECORDS_URL = new URL('../data/live-records.json', import.meta.url);

function injectStyles() {
  if (document.querySelector('link[data-live-records-style]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../live-records.css?v=15', import.meta.url).href;
  link.dataset.liveRecordsStyle = 'true';
  document.head.append(link);
}

function formatKst(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date) + ' KST';
}

function formatValue(value, digits = 4) {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

function validate(records) {
  if (!Array.isArray(records)) throw new Error('live-records.json은 배열이어야 합니다.');
  if (records.length > 2) throw new Error('실제 일별 기록은 최종적으로 정확히 2건까지만 보존합니다.');

  const seenDates = new Set();

  for (const record of records) {
    if (record?.kind !== 't04_day') throw new Error('kind는 t04_day여야 합니다.');
    if (record?.signal_id !== 'jpy-100-krw') throw new Error('대표 신호는 jpy-100-krw여야 합니다.');
    if (record?.record_timezone !== 'Asia/Seoul') throw new Error('기준 시간대는 Asia/Seoul이어야 합니다.');
    if (record?.unit !== 'KRW/100JPY') throw new Error('단위는 KRW/100JPY여야 합니다.');
    if (!Number.isFinite(record?.normalized_value)) throw new Error('normalized_value가 숫자가 아닙니다.');
    if (!record?.source_url || !record?.source_observed_at || !record?.fetched_at) {
      throw new Error('출처 URL·원천 시각·조회 시각이 모두 필요합니다.');
    }

    if (seenDates.has(record.record_date)) {
      throw new Error(`같은 KST 날짜가 중복되어 있습니다: ${record.record_date}`);
    }
    seenDates.add(record.record_date);
  }

  return [...records].sort((a, b) => a.record_date.localeCompare(b.record_date));
}

function computeComparison(records) {
  if (records.length !== 2) return null;

  const [previous, current] = records;
  if (previous.unit !== current.unit) return null;

  const signed = current.normalized_value - previous.normalized_value;
  const percent = previous.normalized_value === 0
    ? null
    : (signed / previous.normalized_value) * 100;

  return {
    signed,
    percent,
    unit: current.unit
  };
}

function makeSection() {
  const section = document.createElement('section');
  section.id = 'preserved-live-records';
  section.setAttribute('aria-labelledby', 'preserved-live-title');

  section.innerHTML = `
    <div class="section-head">
      <div>
        <small>ACTUAL TWO-DAY EVIDENCE</small>
        <h2 id="preserved-live-title">보존된 실제 일별 기록</h2>
      </div>
      <p>합성 fixture가 아닌 실제 공개 환율을 서로 다른 KST 날짜에 보존합니다.</p>
    </div>

    <div class="live-evidence-shell">
      <div class="live-evidence-head">
        <div>
          <span>대표 신호</span>
          <strong>jpy-100-krw</strong>
        </div>
        <div>
          <span>보존 상태</span>
          <strong id="live-record-count">확인 중…</strong>
        </div>
        <div>
          <span>기준 시간대</span>
          <strong>Asia/Seoul</strong>
        </div>
      </div>

      <div id="live-record-message" class="live-record-message">
        실제 일별 기록을 불러오는 중입니다.
      </div>

      <div class="live-record-table-wrap">
        <table class="live-record-table">
          <thead>
            <tr>
              <th>KST 날짜</th>
              <th>100 JPY → KRW</th>
              <th>원천 관측 시각</th>
              <th>조회 시각</th>
              <th>출처</th>
            </tr>
          </thead>
          <tbody id="live-record-rows">
            <tr><td colspan="5">불러오는 중…</td></tr>
          </tbody>
        </table>
      </div>

      <div id="live-delta" class="live-delta">
        <span>어제 대비</span>
        <strong>둘째 실제 날짜 기록 대기 중</strong>
        <small>실제 기록이 2건이 되면 두 저장값으로 다시 계산합니다.</small>
      </div>

      <div class="live-proof">
        <strong>대조 기준</strong>
        <span>source_url · source_observed_at · normalized_value · unit을 보존하고, 두 값의 변화량은 저장값에서 다시 계산합니다.</span>
      </div>
    </div>
  `;

  return section;
}

function insertSection() {
  if (document.querySelector('#preserved-live-records')) return;

  const section = makeSection();
  const footer = document.querySelector('footer');
  if (footer) footer.before(section);
  else document.querySelector('main')?.append(section);
}

function renderRows(records) {
  const tbody = document.querySelector('#live-record-rows');

  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="5">아직 보존된 실제 기록이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  for (const record of records) {
    const tr = document.createElement('tr');

    const sourceLink = document.createElement('a');
    sourceLink.href = record.source_url;
    sourceLink.target = '_blank';
    sourceLink.rel = 'noopener noreferrer';
    sourceLink.textContent = record.source_name || '원자료';

    const cells = [
      record.record_date,
      `${formatValue(record.normalized_value)} ${record.unit}`,
      formatKst(record.source_observed_at),
      formatKst(record.fetched_at),
      sourceLink
    ];

    cells.forEach((value) => {
      const td = document.createElement('td');
      if (value instanceof Node) td.append(value);
      else td.textContent = value;
      tr.append(td);
    });

    tbody.append(tr);
  }
}

function renderComparison(records) {
  const box = document.querySelector('#live-delta');
  const comparison = computeComparison(records);

  if (!comparison) {
    box.className = 'live-delta waiting';
    box.innerHTML = `
      <span>어제 대비</span>
      <strong>둘째 실제 날짜 기록 대기 중</strong>
      <small>첫 기록을 보존했습니다. 다음 KST 날짜에 같은 공개 원천을 다시 조회해 두 번째 기록을 추가합니다.</small>
    `;
    return;
  }

  const sign = comparison.signed > 0 ? '+' : comparison.signed < 0 ? '−' : '';
  const magnitude = Math.abs(comparison.signed);
  const percentText = comparison.percent === null
    ? ''
    : ` (${comparison.percent > 0 ? '+' : comparison.percent < 0 ? '−' : ''}${Math.abs(comparison.percent).toFixed(2)}%)`;

  box.className = `live-delta ${comparison.signed > 0 ? 'up' : comparison.signed < 0 ? 'down' : 'flat'}`;
  box.innerHTML = `
    <span>어제 대비</span>
    <strong>${sign}${formatValue(magnitude)} ${comparison.unit}${percentText}</strong>
    <small>화면 표시값은 보존된 실제 두 날짜의 normalized_value에서 다시 계산했습니다.</small>
  `;
}

function renderState(records) {
  document.querySelector('#live-record-count').textContent = `${records.length} / 2건`;
  renderRows(records);
  renderComparison(records);

  const message = document.querySelector('#live-record-message');

  if (records.length === 1) {
    message.className = 'live-record-message waiting';
    message.textContent =
      `첫 실제 기록 ${records[0].record_date} 보존 완료 · 다음 KST 날짜의 두 번째 실제 조회를 기다리고 있습니다.`;
  } else if (records.length === 2) {
    message.className = 'live-record-message complete';
    message.textContent =
      `서로 다른 KST 날짜의 실제 기록 2건 보존 완료 · 어제 대비를 저장값에서 재계산했습니다.`;
  } else {
    message.className = 'live-record-message';
    message.textContent = '아직 보존된 실제 기록이 없습니다.';
  }
}

function showError(error) {
  document.querySelector('#live-record-count').textContent = '검증 실패';
  const message = document.querySelector('#live-record-message');
  message.className = 'live-record-message error';
  message.textContent = `실제 일별 기록을 확인하지 못했습니다: ${error.message}`;

  document.querySelector('#live-record-rows').innerHTML =
    '<tr><td colspan="5">live-records.json을 확인해 주세요.</td></tr>';
}

export async function setupLiveRecords() {
  injectStyles();
  insertSection();

  try {
    const response = await fetch(RECORDS_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const records = validate(await response.json());
    renderState(records);
  } catch (error) {
    console.error('T04 live records load failed:', error);
    showError(error);
  }
}
