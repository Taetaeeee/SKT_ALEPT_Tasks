const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const usdFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function setupCalculators(getRates) {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  function safeNumber(el) {
    const n = Number(el?.value ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function render() {
    const rates = getRates();
    if (!rates) return;
    const { jpy100Krw, cnyKrw, usdKrw } = rates;

    const jpy = safeNumber($('#jpy-amount'));
    $('#jpy-result').textContent = `${won.format((jpy / 100) * jpy100Krw)}원`;

    const product = safeNumber($('#cny-product'));
    const shipping = safeNumber($('#cny-shipping'));
    const cnyTotal = product + shipping;
    $('#cny-total').textContent = usdFmt.format(cnyTotal);
    $('#cny-result').textContent = `${won.format(cnyTotal * cnyKrw)}원`;

    const payment = safeNumber($('#usd-payment'));
    $('#usd-payment-result').textContent = `${won.format(payment * usdKrw)}원`;

    const price = safeNumber($('#stock-price'));
    const qty = safeNumber($('#stock-qty'));
    const stockTotal = price * qty;
    $('#stock-usd-total').textContent = `$${usdFmt.format(stockTotal)}`;
    $('#stock-result').textContent = `${won.format(stockTotal * usdKrw)}원`;

    const asset = safeNumber($('#usd-asset'));
    $('#usd-asset-result').textContent = `${won.format(asset * usdKrw)}원`;
  }

  ['#jpy-amount','#cny-product','#cny-shipping','#usd-payment','#stock-price','#stock-qty','#usd-asset']
    .forEach(id => $(id)?.addEventListener('input', render));

  $$('.usd-tab').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.usdTab;
    $$('.usd-tab').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    $$('.usd-pane').forEach(p => { p.hidden = p.dataset.usdPane !== key; });
    render();
  }));

  return render;
}
