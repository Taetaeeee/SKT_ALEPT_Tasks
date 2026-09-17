import { fetchLiveRates, LIVE_SOURCE_URL } from './exchange-api.js';
import { setupCalculators } from './calculators.js';

const els = {
  status: document.querySelector('#status'), statusText: document.querySelector('#status-text'),
  jpy: document.querySelector('#jpy-value'), cny: document.querySelector('#cny-value'), usd: document.querySelector('#usd-value'),
  jpyContext: document.querySelector('#jpy-context'), cnyContext: document.querySelector('#cny-context'), usdContext: document.querySelector('#usd-context'),
  sourceObservedAt: document.querySelector('#source-observed-at'), fetchedAt: document.querySelector('#fetched-at'), timezone: document.querySelector('#timezone'), sourceLink: document.querySelector('#source-link'),
  rawKrw: document.querySelector('#raw-krw'), rawJpy: document.querySelector('#raw-jpy'), rawCny: document.querySelector('#raw-cny'), normalizedJpy: document.querySelector('#normalized-jpy'),
  refresh: document.querySelector('#refresh-button'), errorBox: document.querySelector('#error-box'), lastUpdated: document.querySelector('#last-updated'), fetchMode: document.querySelector('#fetch-mode'),
  makeRecord: document.querySelector('#make-record'), downloadRecord: document.querySelector('#download-record'), recordJson: document.querySelector('#record-json')
};

let latestData = null;
let generatedRecord = null;

const kstDateTime = new Intl.DateTimeFormat('ko-KR', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
const won0 = new Intl.NumberFormat('ko-KR', { maximumFractionDigits:0 });

function formatKst(date) { return date instanceof Date && !Number.isNaN(date.getTime()) ? `${kstDateTime.format(date)} KST` : '-'; }
function formatNumber(value, digits=2) { return new Intl.NumberFormat('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value); }
function setLoading(v){ els.refresh.disabled=v; els.refresh.textContent=v?'조회 중…':'↻ 최신 환율 다시 조회'; }
function showError(message){ els.status.dataset.state='error'; els.statusText.textContent='현재 환율 조회 실패'; els.errorBox.hidden=false; els.errorBox.textContent=`${message} 마지막으로 화면에 표시된 값이 있다면 그대로 유지합니다.`; }

const renderCalculators = setupCalculators(() => latestData?.normalized ?? null);

function render(data){
  latestData=data; const { normalized, raw }=data;
  els.jpy.textContent=`₩${formatNumber(normalized.jpy100Krw)}`; els.cny.textContent=`₩${formatNumber(normalized.cnyKrw)}`; els.usd.textContent=`₩${formatNumber(normalized.usdKrw)}`;
  els.jpyContext.textContent=`약 ${won0.format((50000/100)*normalized.jpy100Krw)}원`;
  els.cnyContext.textContent=`약 ${won0.format(299*normalized.cnyKrw)}원`;
  els.usdContext.textContent=`약 ${won0.format(1000*normalized.usdKrw)}원`;
  els.sourceObservedAt.textContent=formatKst(data.sourceObservedAt); els.fetchedAt.textContent=formatKst(data.fetchedAt); els.lastUpdated.textContent=formatKst(data.fetchedAt); els.timezone.textContent='Asia/Seoul (KST)';
  els.rawKrw.textContent=raw.rates.KRW; els.rawJpy.textContent=raw.rates.JPY; els.rawCny.textContent=raw.rates.CNY; els.normalizedJpy.textContent=`${formatNumber(normalized.jpy100Krw,4)} KRW / 100 JPY`;
  els.sourceLink.href=data.sourceUrl; els.sourceLink.textContent='ExchangeRate-API 원자료';
  els.status.dataset.state='fresh';
  if(data.mode==='github-snapshot'){ els.statusText.textContent='공개 원천 직접 조회 실패 · GitHub 저장 환율 표시 중'; els.fetchMode.textContent='GitHub Actions 저장본 (실제 공개 원천에서 수집)'; }
  else { els.statusText.textContent='최신 공개 환율 직접 조회 성공'; els.fetchMode.textContent='브라우저 → 공개 원천 직접 조회'; }
  els.errorBox.hidden=true; renderCalculators();
}

async function loadRates(){ setLoading(true); try{ render(await fetchLiveRates()); }catch(e){ console.error(e); showError(e?.message||'알 수 없는 오류가 발생했습니다.'); }finally{ setLoading(false); } }

function kstDateKey(date){ const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date); const map=Object.fromEntries(parts.map(p=>[p.type,p.value])); return `${map.year}-${map.month}-${map.day}`; }

function makeRecord(){
  if(!latestData){ els.recordJson.textContent='먼저 실제 환율 조회가 성공해야 합니다.'; return; }
  generatedRecord={
    signal_id:'jpy-100-krw',
    record_date:kstDateKey(latestData.fetchedAt),
    source_url:latestData.sourceUrl,
    source_observed_at:latestData.sourceObservedAt.toISOString(),
    normalized_value:Number(latestData.normalized.jpy100Krw.toFixed(4)),
    unit:'KRW/100JPY',
    fetched_at:latestData.fetchedAt.toISOString(),
    raw_krw:latestData.raw.rates.KRW,
    raw_jpy:latestData.raw.rates.JPY
  };
  els.recordJson.textContent=JSON.stringify(generatedRecord,null,2); els.downloadRecord.disabled=false;
}

function downloadRecord(){
  if(!generatedRecord) return;
  const blob=new Blob([`${JSON.stringify(generatedRecord,null,2)}\n`],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`t04-day-${generatedRecord.record_date}.json`; a.click(); URL.revokeObjectURL(url);
}

els.sourceLink.href=LIVE_SOURCE_URL; els.refresh.addEventListener('click',loadRates); els.makeRecord.addEventListener('click',makeRecord); els.downloadRecord.addEventListener('click',downloadRecord); loadRates();
