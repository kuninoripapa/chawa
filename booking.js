/* 茶和 貸切パーティー 予約申込画面
   - 空き状況は availability.json（予約済み・休業日・受付期間）を読み込んで反映
   - 送信はメール（domanagement.net@gmail.com）またはショートメール（090-2469-6706）
*/
(function () {
  'use strict';

  var MAIL = 'domanagement.net@gmail.com';
  var SMS = '09024696706';
  var LEAD_DAYS = 5; // 利用日の5日前まで

  // 祝日（受付期間の分）
  var HOLIDAYS = {
    '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
    '2027-01-01': '元日', '2027-01-11': '成人の日',
    '2027-02-11': '建国記念の日', '2027-02-23': '天皇誕生日',
    '2027-03-21': '春分の日', '2027-03-22': '振替休日'
  };

  var SLOTS = {
    night: { label: '夜', time: '18:30〜21:30' },
    day: { label: '昼', time: '11:00〜14:00' }
  };

  var COURSES = [
    { id: 'A', name: 'Aコース　オードブルスタイル（12品）', price: 6000, min: 10 },
    { id: 'B', name: 'Bコース　オードブルスタイル（10品）', price: 6000, min: 10 },
    { id: 'C', name: 'Cコース　ケータリングスタイル（11品）', price: 7000, min: 15 }
  ];

  var KINDS = ['忘年会', '新年会', '歓送迎会', '誕生日・お祝い', '女子会', '同窓会・OB会', '社内の集まり', 'その他'];

  var cfg = { until: '2026-12-30', booked: [], closed: [] };
  var state = { month: null, date: null, slot: null };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  var WD = ['日', '月', '火', '水', '木', '金', '土'];
  function jp(k) { var d = parse(k); return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + (HOLIDAYS[k] ? '・祝' : '') + '）'; }

  function isHoliday(d) { return !!HOLIDAYS[key(d)]; }
  function isBooked(k, slot) {
    return cfg.booked.some(function (b) { return b.date === k && (b.slot === slot || b.slot === 'all'); });
  }
  // 仮押さえ中（申込受付〜決済待ち）の枠。availability.json の booked で "status":"hold" のもの
  function heldSlots(d) {
    var k = key(d);
    return cfg.booked.filter(function (b) { return b.date === k && b.status === 'hold'; }).map(function (b) { return b.slot; });
  }
  function slotsFor(d) {
    var k = key(d), w = d.getDay(), hol = isHoliday(d), out = [];
    if (cfg.closed.indexOf(k) >= 0) return out;
    var dayOk = w === 0 || w === 6 || hol;
    var nightOk = w !== 2 && w !== 5; // 火・金の夜は通常営業
    if (dayOk && !isBooked(k, 'day')) out.push('day');
    if (nightOk && !isBooked(k, 'night')) out.push('night');
    return out;
  }
  function openable(d) {
    if (d < addDays(today(), LEAD_DAYS)) return false;
    if (d > parse(cfg.until)) return false;
    return slotsFor(d).length > 0;
  }
  // 最低保証人数：土曜・祝前日・12月は12名、ほかは10名
  function minGuests(k) {
    var c = course();
    var cm = c && c.min ? c.min : 10;
    return Math.max(cm, dayMin(k));
  }
  function dayMin(k) {
    var d = parse(k);
    if (d.getMonth() === 11 || d.getDay() === 6 || isHoliday(addDays(d, 1))) return 12;
    return 10;
  }

  var $ = function (id) { return document.getElementById(id); };
  var dlg, grid, title, slotBox, form;

  function renderMonth() {
    var m = state.month;
    title.textContent = m.getFullYear() + '年' + (m.getMonth() + 1) + '月';
    var first = new Date(m.getFullYear(), m.getMonth(), 1);
    var start = addDays(first, -first.getDay());
    var minM = new Date(today().getFullYear(), today().getMonth(), 1);
    var maxD = parse(cfg.until);
    $('bk-prev').disabled = m <= minM;
    $('bk-next').disabled = new Date(m.getFullYear(), m.getMonth() + 1, 1) > maxD;
    grid.innerHTML = '';
    for (var i = 0; i < 42; i++) {
      var d = addDays(start, i), k = key(d);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bk-day';
      b.textContent = d.getDate();
      if (d.getMonth() !== m.getMonth()) { b.classList.add('out'); b.disabled = true; b.setAttribute('aria-hidden', 'true'); grid.appendChild(b); continue; }
      if (d.getDay() === 0 || isHoliday(d)) b.classList.add('sun');
      if (d.getDay() === 6) b.classList.add('sat');
      var ok = openable(d);
      b.disabled = !ok;
      if (ok) {
        var s = slotsFor(d);
        var dots = document.createElement('span');
        dots.className = 'bk-dots';
        s.forEach(function (x) { var i2 = document.createElement('i'); i2.className = x; dots.appendChild(i2); });
        b.appendChild(dots);
        b.setAttribute('aria-label', jp(k) + ' 空きあり（' + s.map(function (x) { return SLOTS[x].label; }).join('・') + '）');
      } else if (d >= addDays(today(), LEAD_DAYS) && d <= parse(cfg.until) && heldSlots(d).length) {
        b.classList.add('hold');
        var hm = document.createElement('span'); hm.className = 'bk-hold'; hm.textContent = '仮'; b.appendChild(hm);
        b.setAttribute('aria-label', jp(k) + ' 仮押さえ中');
      } else {
        b.setAttribute('aria-label', jp(k) + ' 受付なし');
      }
      if (state.date === k) b.classList.add('sel');
      (function (kk) { b.addEventListener('click', function () { pickDate(kk); }); })(k);
      grid.appendChild(b);
    }
  }

  function pickDate(k) {
    state.date = k; state.slot = null;
    renderMonth();
    var s = slotsFor(parse(k));
    slotBox.innerHTML = '';
    var h = document.createElement('p');
    h.className = 'bk-step';
    h.textContent = jp(k) + '　時間帯を選んでください';
    slotBox.appendChild(h);
    var row = document.createElement('div');
    row.className = 'bk-slots';
    s.forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bk-slot';
      b.innerHTML = '<b>' + SLOTS[x].label + '</b>' + SLOTS[x].time;
      b.addEventListener('click', function () {
        state.slot = x;
        Array.prototype.forEach.call(row.children, function (c) { c.classList.remove('sel'); });
        b.classList.add('sel');
        form.hidden = false;
        updateSummary();
        $('bk-guests').focus({ preventScroll: true });
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      row.appendChild(b);
      if (s.length === 1) setTimeout(function () { b.click(); }, 0);
    });
    heldSlots(parse(k)).forEach(function (x) {
      if (!SLOTS[x]) return;
      var hb = document.createElement('button');
      hb.type = 'button'; hb.className = 'bk-slot held'; hb.disabled = true;
      hb.innerHTML = '<b>' + SLOTS[x].label + '</b>仮押さえ中';
      row.appendChild(hb);
    });
    slotBox.appendChild(row);
    slotBox.hidden = false;
  }

  function course() {
    var r = form.querySelector('input[name="course"]:checked');
    return r ? COURSES.filter(function (c) { return c.id === r.value; })[0] : null;
  }

  function yen(n) { return n.toLocaleString('ja-JP') + '円'; }

  function updateSummary() {
    var out = $('bk-sum');
    if (!state.date || !state.slot) { out.textContent = ''; return; }
    var n = parseInt($('bk-guests').value, 10) || 0;
    var c = course();
    var min = minGuests(state.date);
    var lines = [];
    lines.push(jp(state.date) + '　' + SLOTS[state.slot].label + ' ' + SLOTS[state.slot].time);
    if (n) lines.push(n + '名さま（最低保証 ' + min + '名）');
    if (c && n) {
      var billable = Math.max(n, min);
      lines.push('会費の目安：' + yen(c.price) + (c.from ? '〜' : '') + ' × ' + billable + '名 ＝ ' + yen(c.price * billable) + (c.from ? '〜' : '') + '（税込）');
    }
    out.innerHTML = lines.map(function (l) { return '<span>' + l + '</span>'; }).join('');
    $('bk-minnote').textContent = 'この日程・コースの最低人数は' + min + '名です（A・B 10名、C 15名。土曜・祝前日・12月は12名以上）。下回る場合も' + min + '名分の会費となります。';
  }

  function buildText() {
    var c = course();
    var n = parseInt($('bk-guests').value, 10);
    var min = minGuests(state.date);
    var billable = Math.max(n, min);
    return [
      '【茶和 貸切予約申込】',
      '利用日：' + state.date + ' ' + jp(state.date),
      '時間帯：' + SLOTS[state.slot].label + ' ' + SLOTS[state.slot].time,
      '人数：' + n + '名（最低保証' + min + '名）',
      'コース：' + c.name + '（1名' + yen(c.price) + (c.from ? '〜' : '') + '）',
      '会費の目安：' + yen(c.price * billable) + (c.from ? '〜' : '') + '（税込）',
      'パーティの種類：' + $('bk-kind').value,
      'お名前：' + $('bk-name').value.trim(),
      '電話番号：' + $('bk-tel').value.trim(),
      'メール：' + ($('bk-mail').value.trim() || 'なし'),
      'ご要望：' + ($('bk-note').value.trim() || 'なし'),
      '規約第1条（コースは茶和の手配・コーディネートで、会費にコーディネート料を含む）：承諾',
      '破損・汚損・未分別時の追加請求：承諾',
      '',
      '※この申込みはまだ確定ではありません。送信後、この日程は仮押さえとなります。茶和から可否をご連絡し、お受けできる場合は決済リンクをお送りします。ご案内から3時間以内のお支払いでご予約確定、期限を過ぎると仮押さえは解除されます。'
    ].join('\n');
  }

  function validate() {
    var bad = [];
    if (!state.date || !state.slot) bad.push('日付と時間帯');
    var n = parseInt($('bk-guests').value, 10);
    if (!n || n < 1 || n > 35) bad.push('人数（1〜35名）');
    if (!course()) bad.push('コース');
    if (!$('bk-kind').value) bad.push('パーティの種類');
    if (!$('bk-name').value.trim()) bad.push('お名前');
    var tel = $('bk-tel').value.replace(/[^0-9]/g, '');
    if (tel.length < 10) bad.push('電話番号');
    if (!$('bk-agree1').checked || !$('bk-agree2').checked) bad.push('ご確認事項へのチェック');
    return bad;
  }

  function showSend(e) {
    e.preventDefault();
    var bad = validate();
    var err = $('bk-err');
    if (bad.length) { err.textContent = '次の項目を入力・選択してください：' + bad.join('、'); err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
    err.hidden = true;
    var text = buildText();
    $('bk-preview').textContent = text;
    var subject = '【茶和 貸切予約申込】' + state.date + ' ' + SLOTS[state.slot].label + ' ' + $('bk-name').value.trim() + '様';
    $('bk-mailto').href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
    $('bk-smsto').href = 'sms:' + SMS + '?&body=' + encodeURIComponent(text);
    $('bk-send').hidden = false;
    $('bk-send').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function copyText() {
    var t = $('bk-preview').textContent, out = $('bk-copied');
    function fb() {
      var r = document.createRange(); r.selectNodeContents($('bk-preview'));
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
      out.textContent = '文面を選択しました。長押しでコピーしてください。';
    }
    try { navigator.clipboard.writeText(t).then(function () { out.textContent = '申込内容をコピーしました。'; }, fb); } catch (e) { fb(); }
  }

  function open() {
    if (!state.month) { var t = addDays(today(), LEAD_DAYS); state.month = new Date(t.getFullYear(), t.getMonth(), 1); }
    renderMonth();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
    document.body.style.overflow = '';
  }

  function init() {
    dlg = $('bkdlg'); grid = $('bk-grid'); title = $('bk-title'); slotBox = $('bk-slotbox'); form = $('bk-form');
    // コース・種類の選択肢
    var cl = $('bk-courses');
    COURSES.forEach(function (c) {
      var l = document.createElement('label');
      l.className = 'bk-course';
      l.innerHTML = '<input type="radio" name="course" value="' + c.id + '"><span>' + c.name + '</span><em>1名 ' + yen(c.price) + (c.from ? '〜' : '') + '</em>';
      cl.appendChild(l);
    });
    var ks = $('bk-kind');
    KINDS.forEach(function (k) { var o = document.createElement('option'); o.textContent = k; ks.appendChild(o); });

    $('bk-prev').addEventListener('click', function () { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderMonth(); });
    $('bk-next').addEventListener('click', function () { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderMonth(); });
    $('bk-close').addEventListener('click', close);
    dlg.addEventListener('close', function () { document.body.style.overflow = ''; });
    form.addEventListener('input', updateSummary);
    form.addEventListener('change', updateSummary);
    form.addEventListener('submit', showSend);
    $('bk-copy').addEventListener('click', copyText);

    Array.prototype.forEach.call(document.querySelectorAll('[data-open-booking]'), function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); open(); });
    });
    var vid = $('vid');
    if (vid) { vid.style.cursor = 'pointer'; vid.addEventListener('click', open); }

    fetch('availability.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j) {
          if (j.until) cfg.until = j.until;
          if (Array.isArray(j.booked)) cfg.booked = j.booked;
          if (Array.isArray(j.closed)) cfg.closed = j.closed;
        }
        if (dlg.open) renderMonth();
      })
      .catch(function () {});
    if (location.hash === '#yoyaku') open();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
