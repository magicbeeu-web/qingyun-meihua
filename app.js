/* 青雲子 梅花易數・每週免費一卦 v1 pure static, no build step.
 * Weekly-limit logic follows 魔法蜜蜂 tarot site (/workspace/line-tarot/web/app.js). */
(function () {
'use strict';

/* ================= 設定 CONFIG ================= */
var CONFIG = {
  // ===== 首頁主視覺：換圖只改這裡 =====
  // style 'logo'  → 書法 Logo，無外框（目前）
  // style 'photo' → 圓形頭像加金色細框（之後換成人物照，例如 'avatar.jpg'）
  HERO_SRC: 'hero-logo.webp',
  HERO_STYLE: 'logo',
  // ====================================
  FREE_PER_WEEK: 1,
  LINE_ID: '@067dffds',
  SERVICES: [
    { name: '六爻問事', desc: '感情工作抉擇，一事一卦問清楚', bits: '011000' },
    { name: '八字流年', desc: '今明兩年的財運事業與感情走向', bits: '101101' },
    { name: '八字終身命盤', desc: '四柱十神與五行喜用，大運全解', bits: '111111' },
    { name: '紫微斗數命盤', desc: '十二宮完整解讀，看見人生全貌', bits: '010101' },
    { name: '擇日', desc: '開業搬家與嫁娶，挑一個好日子', bits: '100110' },
    { name: '合婚', desc: '兩人八字合盤，看相處與緣分', bits: '110011' }
  ],
  TZ_OFFSET_H: 8,                 // Asia/Taipei (no DST)
  STORAGE_KEY: 'qyz_meihua_v1'
};
function lineChat(text) { return 'https://line.me/R/oaMessage/' + CONFIG.LINE_ID + '/?' + encodeURIComponent(text); }
var LINE_ADD = 'https://line.me/R/ti/p/' + CONFIG.LINE_ID;

var params = new URLSearchParams(location.search);
var TEST_MODE = params.get('test') === '1';
// ?reset=1 clears this device's weekly record (for demos), then drops the param
if (params.get('reset') === '1') { try { localStorage.removeItem(CONFIG.STORAGE_KEY); localStorage.removeItem(CONFIG.STORAGE_KEY + '_test'); } catch (e) {} params.delete('reset'); try { history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash); } catch (e) {} }
var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= 週期 Week helpers (Monday 00:00 Asia/Taipei) ================= */
var DAY = 864e5, OFF = CONFIG.TZ_OFFSET_H * 36e5;
function weekStart(now) {            // UTC ms of this week's Monday 00:00 Taipei
  var t = new Date(now + OFF), back = (t.getUTCDay() + 6) % 7;
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - back) - OFF;
}
function md(ms) { var t = new Date(ms + OFF); return (t.getUTCMonth() + 1) + '/' + t.getUTCDate(); }

/* ================= 次數儲存 store (localStorage; swap for LIFF userId + server later) =================
 * Record: { weekStart:Number, uses:Number, at:Number, q:String, n:[n1,n2,n3] } */
var store = {
  key: TEST_MODE ? CONFIG.STORAGE_KEY + '_test' : CONFIG.STORAGE_KEY,
  load: function () { try { return JSON.parse(localStorage.getItem(this.key)) || null; } catch (e) { return null; } },
  save: function (rec) { try { localStorage.setItem(this.key, JSON.stringify(rec)); } catch (e) {} return rec; }
};
function quota(rec, now) {
  var ws = weekStart(now), cur = rec && rec.weekStart === ws ? rec : null, used = cur ? (cur.uses || 0) : 0;
  return { weekStart: ws, nextReset: ws + 7 * DAY, current: cur,
    remaining: TEST_MODE ? Math.max(1, CONFIG.FREE_PER_WEEK - used) : Math.max(0, CONFIG.FREE_PER_WEEK - used) };
}

/* ================= utils ================= */
var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function rndInt(lo, hi) { var a = new Uint32Array(1); crypto.getRandomValues(a); return lo + Math.floor(a[0] / 4294967296 * (hi - lo + 1)); }
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 2400); }
var CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八'];
var POS = ['初', '二', '三', '四', '五', '上'];

/* ================= 梅花易數 (traditional rules) =================
 * 先天數 乾1 兌2 離3 震4 巽5 坎6 艮7 坤8
 * 上卦 = n1 mod 8, 下卦 = n2 mod 8 (0 → 8), 動爻 = (n1+n2+n3) mod 6 (0 → 6)
 * Hexagram key = bottom-to-top bits (1 = yang) = lower.bits + upper.bits
 * 互卦: lower = lines 2,3,4; upper = lines 3,4,5. 變卦: flip the moving line.
 * 體 = trigram without the moving line, 用 = trigram with it. */
var HEX = null, TRI = null, TY = null, TRI_BY_NUM = {}, TRI_BY_BITS = {};
var dataP = Promise.all(['hexagrams.json', 'trigrams.json', 'tiyong.json'].map(function (u) {
  return fetch(u + '?v=20261027a').then(function (r) { if (!r.ok) throw new Error(u); return r.json(); });
})).then(function (d) {
  HEX = d[0]; TRI = d[1]; TY = d[2];
  Object.keys(TRI).forEach(function (k) { var t = TRI[k]; t.name = k; TRI_BY_NUM[t.num] = t; TRI_BY_BITS[t.bits] = t; });
});
function mod(n, m) { var r = n % m; return r === 0 ? m : r; }
function cast(n1, n2, n3) {
  var up = TRI_BY_NUM[mod(n1, 8)], lo = TRI_BY_NUM[mod(n2, 8)], mv = mod(n1 + n2 + n3, 6);
  var ben = lo.bits + up.bits;
  var hu = ben.slice(1, 4) + ben.slice(2, 5);
  var bian = ben.split(''); bian[mv - 1] = bian[mv - 1] === '1' ? '0' : '1'; bian = bian.join('');
  var ti = mv <= 3 ? up : lo, yong = mv <= 3 ? lo : up;
  var S = TY.wuxing.sheng, K = TY.wuxing.ke, rel, how;
  if (ti.element === yong.element) { rel = 'bihe'; how = '體用同屬' + ti.element; }
  else if (S[yong.element] === ti.element) { rel = 'yong_sheng_ti'; how = yong.element + '生' + ti.element; }
  else if (K[ti.element] === yong.element) { rel = 'ti_ke_yong'; how = ti.element + '剋' + yong.element; }
  else if (S[ti.element] === yong.element) { rel = 'ti_sheng_yong'; how = ti.element + '生' + yong.element; }
  else { rel = 'yong_ke_ti'; how = yong.element + '剋' + ti.element; }
  return { n: [n1, n2, n3], up: up, lo: lo, mv: mv, ben: HEX[ben], hu: HEX[hu], bian: HEX[bian],
    ti: ti, yong: yong, rel: rel, relInfo: TY.relations[rel], how: how,
    upR: n1 % 8, loR: n2 % 8, sum: n1 + n2 + n3, mvR: (n1 + n2 + n3) % 6 };
}
var SEAL = { yong_sheng_ti: '吉', bihe: '吉', ti_ke_yong: '成', ti_sheng_yong: '守', yong_ke_ti: '慎' };

/* ================= drawing ================= */
function hexHTML(bits, moving, w) {
  var rows = '';
  for (var i = 5; i >= 0; i--) {
    var mv = moving === i + 1;
    rows += '<div class="yrow"><div class="yao' + (mv ? ' mv' : '') + '" style="width:' + w + 'px">' +
      (bits[i] === '1' ? '<i class="full"></i>' : '<i class="half"></i><i class="half"></i>') +
      '</div><span class="mark">' + (mv ? (bits[i] === '1' ? '○' : '×') : '') + '</span></div>';
  }
  return '<div class="hex">' + rows + '</div>';
}
function baguaRing(size, op) {
  var c = size / 2, rIn = size * 0.36, out = '', ticks = '';
  var pos = { '乾': -90, '兌': -135, '離': 180, '震': 135, '坤': 90, '艮': 45, '坎': 0, '巽': -45 };
  var bits = { '乾': '111', '兌': '110', '離': '101', '震': '100', '巽': '011', '坎': '010', '艮': '001', '坤': '000' };
  Object.keys(pos).forEach(function (n) {
    for (var i = 0; i < 3; i++) {
      var y = c - (rIn + i * 9), w = 34, g = 7, el = '<g transform="rotate(' + (pos[n] + 90) + ' ' + c + ' ' + c + ')">';
      el += bits[n][i] === '1' ? '<rect x="' + (c - w / 2) + '" y="' + y + '" width="' + w + '" height="4" rx="1"/>'
        : '<rect x="' + (c - w / 2) + '" y="' + y + '" width="' + (w - g) / 2 + '" height="4" rx="1"/><rect x="' + (c + g / 2) + '" y="' + y + '" width="' + (w - g) / 2 + '" height="4" rx="1"/>';
      out += el + '</g>';
    }
  });
  for (var a = 0; a < 360; a += 6) {
    var r = a * Math.PI / 180;
    ticks += '<line x1="' + (c + size * .47 * Math.cos(r)).toFixed(1) + '" y1="' + (c + size * .47 * Math.sin(r)).toFixed(1) + '" x2="' + (c + size * .49 * Math.cos(r)).toFixed(1) + '" y2="' + (c + size * .49 * Math.sin(r)).toFixed(1) + '" stroke="#e8c98a" stroke-width="1"/>';
  }
  return '<svg class="bagua" viewBox="0 0 ' + size + ' ' + size + '" style="opacity:' + op + '"><g fill="#e8c98a">' + out + '</g>' +
    '<circle cx="' + c + '" cy="' + c + '" r="' + size * .495 + '" fill="none" stroke="#e8c98a" stroke-width=".8"/>' +
    '<circle cx="' + c + '" cy="' + c + '" r="' + size * .465 + '" fill="none" stroke="#e8c98a" stroke-width=".5"/>' +
    '<circle cx="' + c + '" cy="' + c + '" r="' + size * .33 + '" fill="none" stroke="#e8c98a" stroke-width=".5" stroke-dasharray="1 4"/>' + ticks + '</svg>';
}
var CLOUD = '<svg class="cloud {c}" viewBox="0 0 220 70" fill="none" stroke="#e8c98a" stroke-width="1.1" stroke-linecap="round"><path d="M10 55 H70 C60 55 52 47 52 38 C52 28 60 20 70 20 C80 20 87 27 87 36 C87 42 82 46 77 46 C72 46 69 42 69 38 C69 34 72 32 75 32"/><path d="M87 36 C90 18 105 8 122 8 C142 8 157 23 157 40 C157 49 150 55 141 55 C133 55 128 49 128 43 C128 38 132 35 136 35"/><path d="M157 40 C162 32 170 28 178 28 C190 28 198 37 198 46 C198 51 195 55 190 55 H210"/><path d="M30 63 H190" opacity=".5"/></svg>';

/* ================= static decoration + config ================= */
var app = $('app');
if (TEST_MODE) app.classList.add('test');
(function () {
  var hero = $('hero'), img = $('heroImg');
  hero.className = 'avatar ' + (CONFIG.HERO_STYLE === 'photo' ? 'photo' : 'logo');
  img.src = CONFIG.HERO_SRC;
  document.querySelectorAll('.ring').forEach(function (r) { r.outerHTML = baguaRing(+r.dataset.size, r.dataset.op); });
  document.querySelector('.cloud-layer').innerHTML = CLOUD.replace('{c}', 'c1') + CLOUD.replace('{c}', 'c2') + CLOUD.replace('{c}', 'c3');
  $('ctaLine1').href = $('ctaLine2').href = LINE_ADD;
  $('chips').innerHTML = CONFIG.SERVICES.map(function (s) { return '<a href="' + esc(lineChat('我想詢問' + s.name)) + '" target="_blank" rel="noopener">' + esc(s.name) + '</a>'; }).join('');
  $('svcList').innerHTML = CONFIG.SERVICES.map(function (s) {
    return '<a class="svc" href="' + esc(lineChat('我想詢問' + s.name)) + '" target="_blank" rel="noopener"><div class="svc-ic">' + hexHTML(s.bits, 0, 22) +
      '</div><div class="svc-tx"><p class="svc-n">' + esc(s.name) + '</p><p class="svc-d">' + esc(s.desc) + '</p></div><div class="svc-p">私訊詢問<span>›</span></div></a>';
  }).join('');
})();

/* ================= screens ================= */
function show(id) {
  ['home', 'casting', 'result', 'used'].forEach(function (s) { $(s).classList.toggle('on', s === id); });
  app.dataset.screen = id;
  window.scrollTo(0, 0);
}

var Q = null, countdownT = null;
function renderHome() {
  Q = quota(store.load(), Date.now());
  clearInterval(countdownT);
  if (Q.remaining > 0) {
    $('homeNote').textContent = TEST_MODE ? '測試模式：不限次數' : '每人每週可免費起卦一次';
    show('home');
  } else renderUsed();
}
function renderUsed() {
  var rec = Q.current;
  dataP.then(function () {
    var r = cast(rec.n[0], rec.n[1], rec.n[2]);
    $('btnBack').textContent = '回看本週卦象　' + r.ben.full + ' → ' + r.bian.full + ' ›';
  });
  $('resetAt').textContent = '下週一 ' + md(Q.nextReset) + ' 00:00 可再起卦';
  var tick = function () {
    var left = Math.max(0, Q.nextReset - Date.now());
    if (left === 0) { renderHome(); return; }
    var d = Math.floor(left / DAY), h = Math.floor(left % DAY / 36e5), m = Math.floor(left % 36e5 / 6e4);
    $('cd').textContent = d; $('ch').textContent = (h < 10 ? '0' : '') + h; $('cm').textContent = (m < 10 ? '0' : '') + m;
  };
  tick(); countdownT = setInterval(tick, 20000);
  show('used');
}
$('btnBack').addEventListener('click', function () { if (Q && Q.current) dataP.then(function () { renderResult(Q.current); show('result'); }); });
$('btnHome').addEventListener('click', renderHome);

/* ================= HOME: input ================= */
function readNum(id) { var v = ($(id).value || '').replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 65248); }).trim(); return /^\d{1,4}$/.test(v) ? parseInt(v, 10) : NaN; }
['n1', 'n2', 'n3'].forEach(function (id, i, arr) {
  $(id).addEventListener('input', function () {
    var el = $(id); el.value = el.value.replace(/[^0-9０-９]/g, '').slice(0, 4); $('err').textContent = '';
  });
});
$('btnRand').addEventListener('click', function () {
  $('n1').value = rndInt(1, 99); $('n2').value = rndInt(1, 99); $('n3').value = rndInt(1, 99);
  $('err').textContent = '';
});
$('castForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var n = [readNum('n1'), readNum('n2'), readNum('n3')];
  if (n.some(function (x) { return !(x >= 1); })) { $('err').textContent = '請寫下三個大於零的整數，每個最多四位數。'; return; }
  Q = quota(store.load(), Date.now());
  if (Q.remaining <= 0) { renderUsed(); return; }
  var q = ($('q').value || '').trim().slice(0, 40);
  var rec = { weekStart: Q.weekStart, uses: ((Q.current && Q.current.uses) || 0) + 1, at: Date.now(), q: q, n: n };
  store.save(rec); Q = quota(rec, Date.now());   // save first, so a refresh can't cast again
  dataP.then(function () { playCast(rec); }).catch(function () { toast('讀取卦象資料失敗，請重新整理'); });
});

/* ================= casting animation: lines rise from the bottom ================= */
function playCast(rec) {
  var r = cast(rec.n[0], rec.n[1], rec.n[2]), box = $('castHex');
  box.innerHTML = hexHTML(r.ben.key, r.mv, 150);
  var rows = box.querySelectorAll('.yrow');
  rows.forEach(function (x) { x.classList.add('pre'); });
  show('casting');
  var step = REDUCED ? 0 : 260;
  for (var i = 0; i < 6; i++) (function (k) { setTimeout(function () { rows[5 - k].classList.remove('pre'); }, 200 + k * step); })(i);
  setTimeout(function () { renderResult(rec); show('result'); }, REDUCED ? 300 : 200 + 6 * step + 700);
}

/* ================= RESULT ================= */
function renderResult(rec) {
  var r = cast(rec.n[0], rec.n[1], rec.n[2]), L = r.ben.lines[r.mv - 1];
  $('asked').textContent = rec.q ? '所問：' + rec.q : '心中所問之事';
  $('calc').textContent = '數字 ' + r.n.join('・') + '　｜　上卦' + r.up.name + '　下卦' + r.lo.name + '　動在' + CN[r.mv] + '爻';
  $('calc2').textContent = r.n[0] + ' 除以 8 餘 ' + r.upR + (r.upR ? '' : ' 作 8') + ' 得' + r.up.name + '，' +
    r.n[1] + ' 除以 8 餘 ' + r.loR + (r.loR ? '' : ' 作 8') + ' 得' + r.lo.name + '，' +
    '三數相加 ' + r.sum + ' 除以 6 餘 ' + r.mvR + (r.mvR ? '' : ' 作 6') + '，動在第' + CN[r.mv] + '爻。';
  function col(tag, h, mv, sub) {
    return '<div class="hcol"><p class="tag">' + tag + '</p>' + hexHTML(h.key, mv, 74) +
      '<h2 class="hname">' + esc(h.name) + '</h2><p class="hsub">' + esc(h.full) + '</p>' + (sub ? '<p class="hrole">' + sub + '</p>' : '') + '</div>';
  }
  $('hexrow').innerHTML = col('本卦', r.ben, r.mv, '事之始') + col('互卦', r.hu, 0, '事之中') + col('變卦', r.bian, 0, '事之終');
  var ri = r.relInfo;
  $('verdict').innerHTML = '<div class="v-top"><span class="v-seal">' + SEAL[r.rel] + '</span><div><p class="v-title">' + esc(ri.verdict) + '</p>' +
    '<p class="v-sub">' + esc(ri.label) + '　體' + r.ti.name + r.ti.element + '　用' + r.yong.name + r.yong.element + '　' + esc(r.how) + '</p></div></div>' +
    '<div class="divider small"><span></span><b>◆</b><span></span></div>' +
    '<p class="advice"><b>體用斷事</b>' + esc(ri.plain) + '</p>' +
    '<p class="ty-note">動爻在' + (r.mv <= 3 ? '下卦' : '上卦') + '，所以' + (r.mv <= 3 ? '下卦' : '上卦') + r.yong.name + '為用，代表所問之事；' + (r.mv <= 3 ? '上卦' : '下卦') + r.ti.name + '為體，代表你自己。</p>';
  $('benCard').innerHTML = '<p class="r-k">本卦</p><p class="r-t">' + esc(r.ben.full) + '</p>' +
    '<p class="classic">' + esc(r.ben.guaci) + '</p>' + (r.ben.tuan ? '<p class="tuan">彖曰：' + esc(r.ben.tuan) + '</p>' : '') +
    '<p class="advice"><b>卦意</b>' + esc(r.ben.meaning) + '</p>';
  $('lineCard').innerHTML = '<p class="r-k">動爻・第' + CN[r.mv] + '爻</p><p class="r-t">' + esc(L.name) + '</p>' +
    '<p class="classic">' + esc(L.text) + '</p><p class="advice"><b>青雲子白話</b>' + esc(L.plain) + '</p>';
  $('bianCard').innerHTML = '<p class="r-k">變卦・事情的後續</p><p class="r-t">' + esc(r.bian.full) + '</p>' +
    '<p class="classic">' + esc(r.bian.guaci) + '</p><p class="advice"><b>卦意</b>' + esc(r.bian.meaning) + '</p>';
  var q = quota(rec, Date.now());
  $('resNote').textContent = TEST_MODE ? '測試模式：不限次數' : '下次免費起卦：' + md(q.nextReset) + '（一）00:00 起';
}

/* boot */
dataP.catch(function () { toast('讀取卦象資料失敗，請重新整理'); });
renderHome();

// expose for automated testing
window.__qyz = { cast: function (a, b, c) { return dataP.then(function () { var r = cast(a, b, c);
  return { ben: r.ben.full, hu: r.hu.full, bian: r.bian.full, mv: r.mv, ti: r.ti.name, yong: r.yong.name, rel: r.rel }; }); } };
})();
