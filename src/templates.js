const W = 3840;
const H = 2160;
const CANVAS_ASPECT = W / H;
const DEFAULT_ASPECT = 16 / 9; // 写真が無いときの仮の比率（VRChat 標準）

const WEEKLY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const MONTHLY_PATTERN_NAMES = {
  A: '縦4枚 → パターンA',
  B: '縦3+横1 → パターンB',
  C: '縦2+横2 → パターンC',
  D: '縦1+横3 → パターンD',
  E: '横4枚 → パターンE',
};

/**
 * レイアウト定義
 * dynamic: 写真の枚数・縦横比に応じて組み直す
 * def: 写真が無いときの枠数 / max: 最大枚数
 */
export const LAYOUTS = {
  weekly: { name: 'Weekly', group: 'preset' },
  monthly: { name: 'Monthly', group: 'preset' },
  yearly: { name: 'Yearly', group: 'preset' },
  auto: { name: '自動分割', group: 'auto', def: 6, max: 20 },
  justified: { name: '行揃え', group: 'auto', def: 7, max: 24 },
  masonry: { name: '段組み', group: 'auto', def: 8, max: 24 },
  hero: { name: '主役＋脇役', group: 'compose', def: 5, max: 9 },
  golden: { name: '黄金比', group: 'compose', def: 5, max: 6 },
  radial: { name: 'サークル', group: 'compose', def: 7, max: 9 },
  calendar: { name: 'カレンダー', group: 'compose' },
  film: { name: 'フィルム', group: 'style', def: 5, max: 10 },
  polaroid: { name: 'ポラロイド', group: 'style', def: 6, max: 12 },
  diagonal: { name: '斜め分割', group: 'style', def: 5, max: 8 },
  // デザイン
  honeycomb: { name: 'ハニカム', group: 'design', def: 10, max: 30 },
  minimal: { name: 'ミニマル', group: 'design', def: 3, max: 8 },
  diamond: { name: 'ダイヤ', group: 'design', def: 8, max: 24 },
  bgframe: { name: '背景＋フレーム', group: 'design', def: 4, max: 7 },
  timeline: { name: 'タイムライン', group: 'design', def: 5, max: 8 },
  scrapbook: { name: 'スクラップブック', group: 'design', def: 5, max: 9 },
};

export function getLayoutMax(template) {
  return LAYOUTS[template]?.max ?? null;
}

// ==================== Monthly ====================

export function detectMonthlyPattern(photos) {
  const first4 = photos.slice(0, 4);
  if (first4.length === 0) return 'A';
  const vCount = first4.filter((p) => p.naturalHeight > p.naturalWidth).length;
  if (vCount === first4.length) return 'A';
  if (vCount === 3) return 'B';
  if (vCount === 2) return 'C';
  if (vCount === 1) return 'D';
  return 'E';
}

export function getMonthlyPatternName(pattern) {
  return MONTHLY_PATTERN_NAMES[pattern] || '';
}

// ==================== Entry ====================

/**
 * @param {string} template
 * @param {Array} photos
 * @param {object} opts state（レイアウト設定を参照）
 */
export function getTemplateConfig(template, photos, opts = {}) {
  const variant = opts.layoutVariant || 0;
  const aspects = () => photoAspects(photos, LAYOUTS[template]);
  switch (template) {
    case 'monthly':
      return buildMonthly(photos);
    case 'yearly':
      return buildYearly();
    case 'auto':
      return dyn(buildAuto(aspects(), variant));
    case 'justified':
      return dyn(buildJustified(aspects(), variant));
    case 'masonry':
      return dyn(buildMasonry(aspects(), variant));
    case 'hero':
      return dyn(buildHero(aspects().length, opts.heroPos || 'left'));
    case 'golden':
      return dyn(buildGolden(aspects().length));
    case 'radial':
      return dyn(buildRadial(aspects().length));
    case 'calendar':
      return buildCalendar(opts);
    case 'film':
      return buildFilm(aspects().length);
    case 'polaroid':
      return buildPolaroid(aspects().length, opts.polaroidTilt ?? 6, (opts.polaroidSeed || 1) + variant);
    case 'diagonal':
      return dyn(buildDiagonal(aspects().length, opts.diagonalSlant ?? 300));
    case 'honeycomb':
      return dyn(buildHoneycomb(aspects().length));
    case 'diamond':
      return dyn(buildDiamond(aspects().length));
    case 'minimal':
      return buildMinimal(aspects(), opts, photos);
    case 'bgframe':
      return dyn(buildBgFrame(aspects(), opts));
    case 'timeline':
      return buildTimeline(aspects(), opts, photos);
    case 'scrapbook':
      return buildScrapbook(aspects(), opts, photos, (opts.polaroidSeed || 1) + variant);
    case 'weekly':
    default:
      return buildWeekly();
  }
}

export function getCustomGridConfig(rows, cols) {
  const slotW = W / cols;
  const slotH = H / rows;
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      slots.push({ x: c * slotW, y: r * slotH, w: slotW, h: slotH, label: '' });
    }
  }
  return { rows, cols, slots, hasLabels: true, labelsEditable: true };
}

function dyn(slots) {
  return { rows: null, cols: null, slots, hasLabels: false, dynamic: true };
}

function photoAspects(photos, layout) {
  const max = layout?.max ?? photos.length;
  if (photos.length === 0) return Array(layout?.def ?? 4).fill(DEFAULT_ASPECT);
  return photos.slice(0, max).map((p) => p.naturalWidth / p.naturalHeight);
}

// ==================== Presets ====================

function buildWeekly() {
  const cols = 5;
  const slotW = W / cols;
  const slots = [];
  for (let i = 0; i < cols; i++) {
    slots.push({ x: i * slotW, y: 0, w: slotW, h: H, label: WEEKLY_LABELS[i] });
  }
  return { rows: 1, cols: 5, slots, hasLabels: true, labelsEditable: true };
}

function buildMonthly(photos) {
  const pattern = detectMonthlyPattern(photos);
  let slots;

  switch (pattern) {
    case 'A':
      slots = Array.from({ length: 4 }, (_, i) => ({
        x: i * 960, y: 0, w: 960, h: H, label: '', slotType: 'portrait',
      }));
      break;

    case 'B':
      slots = [
        { x: 0, y: 0, w: 768, h: H, label: '', slotType: 'portrait' },
        { x: 768, y: 0, w: 768, h: H, label: '', slotType: 'portrait' },
        { x: 1536, y: 0, w: 768, h: H, label: '', slotType: 'portrait' },
        { x: 2304, y: 0, w: 1536, h: H, label: '', slotType: 'landscape' },
      ];
      break;

    case 'C':
      slots = [
        { x: 0, y: 0, w: 960, h: H, label: '', slotType: 'portrait' },
        { x: 960, y: 0, w: 960, h: H, label: '', slotType: 'portrait' },
        { x: 1920, y: 0, w: 1920, h: 1080, label: '', slotType: 'landscape' },
        { x: 1920, y: 1080, w: 1920, h: 1080, label: '', slotType: 'landscape' },
      ];
      break;

    case 'D':
      slots = [
        { x: 0, y: 0, w: 960, h: H, label: '', slotType: 'portrait' },
        { x: 960, y: 0, w: 2880, h: 720, label: '', slotType: 'landscape' },
        { x: 960, y: 720, w: 2880, h: 720, label: '', slotType: 'landscape' },
        { x: 960, y: 1440, w: 2880, h: 720, label: '', slotType: 'landscape' },
      ];
      break;

    case 'E':
    default:
      slots = [
        { x: 0, y: 0, w: 1920, h: 1080, label: '', slotType: 'landscape' },
        { x: 1920, y: 0, w: 1920, h: 1080, label: '', slotType: 'landscape' },
        { x: 0, y: 1080, w: 1920, h: 1080, label: '', slotType: 'landscape' },
        { x: 1920, y: 1080, w: 1920, h: 1080, label: '', slotType: 'landscape' },
      ];
      break;
  }

  return { rows: null, cols: null, slots, hasLabels: false, pattern, dynamic: true };
}

function buildYearly() {
  const cols = 6;
  const rows = 2;
  const slotW = W / cols;
  const slotH = H / rows;
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const num = r * cols + c + 1;
      slots.push({
        x: c * slotW, y: r * slotH, w: slotW, h: slotH,
        label: String(num).padStart(2, '0'),
        labelStyle: 'corner-br',
      });
    }
  }
  return { rows: 2, cols: 6, slots, hasLabels: true, labelsEditable: true };
}

// ==================== 自動分割（ギロチン分割の探索） ====================

/**
 * 写真の並び順を保ったまま「横に並べる / 縦に積む」の二分木を探索し、
 * 全体の比率がキャンバス(16:9)に近く、面積の偏りが少ない配置を選ぶ。
 * 横並び: 比率 = a1 + a2、縦積み: 比率 = 1 / (1/a1 + 1/a2)
 */
function buildAuto(aspects, variant) {
  const n = aspects.length;
  const BUCKETS = 10;
  const memo = new Map();

  const logStd = (areas) => {
    const logs = areas.map((a) => Math.log(a));
    const mean = logs.reduce((s, v) => s + v, 0) / logs.length;
    return Math.sqrt(logs.reduce((s, v) => s + (v - mean) ** 2, 0) / logs.length);
  };

  const combine = (l, r, dir) => {
    let a;
    let areas;
    if (dir === 'h') {
      // 高さ1で横に並べる → 各子の面積 = 子の比率
      a = l.a + r.a;
      areas = [...l.areas.map((v) => v * l.a), ...r.areas.map((v) => v * r.a)];
    } else {
      // 幅1で縦に積む → 各子の面積 = 1/子の比率
      a = 1 / (1 / l.a + 1 / r.a);
      areas = [...l.areas.map((v) => v / l.a), ...r.areas.map((v) => v / r.a)];
    }
    const sum = areas.reduce((s, v) => s + v, 0);
    areas = areas.map((v) => v / sum);
    return { a, areas, std: logStd(areas), node: { dir, l: l.node, r: r.node, la: l.a, ra: r.a } };
  };

  const all = (i, j) => {
    const list = [];
    for (let k = i; k < j; k++) {
      for (const l of cands(i, k)) {
        for (const r of cands(k + 1, j)) {
          list.push(combine(l, r, 'h'), combine(l, r, 'v'));
        }
      }
    }
    return list;
  };

  // 比率の対数でバケット分けし、各バケットで最も均整の取れた候補だけ残す
  const prune = (list) => {
    const logs = list.map((c) => Math.log(c.a));
    const lo = Math.min(...logs);
    const hi = Math.max(...logs);
    const best = new Map();
    list.forEach((c, idx) => {
      const b = hi > lo ? Math.min(BUCKETS - 1, Math.floor(((logs[idx] - lo) / (hi - lo)) * BUCKETS)) : 0;
      const cur = best.get(b);
      if (!cur || c.std < cur.std) best.set(b, c);
    });
    return [...best.values()];
  };

  function cands(i, j) {
    if (i === j) return [{ a: aspects[i], areas: [1], std: 0, node: { leaf: i } }];
    const key = i * 100 + j;
    if (!memo.has(key)) memo.set(key, prune(all(i, j)));
    return memo.get(key);
  }

  if (n === 1) return [{ x: 0, y: 0, w: W, h: H, label: '' }];

  const root = all(0, n - 1)
    .map((c) => ({ ...c, cost: Math.abs(Math.log(c.a / CANVAS_ASPECT)) * 2 + c.std * 0.6 }))
    .sort((p, q) => p.cost - q.cost);
  // 似た候補が並ばないよう、比率が十分違うものだけを順に採用
  const picks = [];
  for (const c of root) {
    if (picks.every((p) => Math.abs(p.a - c.a) > 0.01 || Math.abs(p.std - c.std) > 0.01)) picks.push(c);
    if (picks.length >= 8) break;
  }
  const chosen = picks[variant % picks.length];

  const out = [];
  const place = (node, x, y, w, h) => {
    if (node.leaf !== undefined) {
      out[node.leaf] = { x, y, w, h, label: '' };
      return;
    }
    if (node.dir === 'h') {
      const wl = (w * node.la) / (node.la + node.ra);
      place(node.l, x, y, wl, h);
      place(node.r, x + wl, y, w - wl, h);
    } else {
      const hl = (h * (1 / node.la)) / (1 / node.la + 1 / node.ra);
      place(node.l, x, y, w, hl);
      place(node.r, x, y + hl, w, h - hl);
    }
  };
  place(chosen.node, 0, 0, W, H);
  return out;
}

// ==================== 行揃え（Flickr justified 方式） ====================

function buildJustified(aspects, variant) {
  const n = aspects.length;
  const candidates = [];

  const evaluate = (breaks) => {
    // breaks: 各行の枚数
    const rows = [];
    let i = 0;
    for (const count of breaks) {
      const as = aspects.slice(i, i + count);
      rows.push({ start: i, as, h: W / as.reduce((s, a) => s + a, 0) });
      i += count;
    }
    const total = rows.reduce((s, r) => s + r.h, 0);
    const logs = rows.map((r) => Math.log(r.h));
    const mean = logs.reduce((s, v) => s + v, 0) / logs.length;
    const spread = Math.sqrt(logs.reduce((s, v) => s + (v - mean) ** 2, 0) / logs.length);
    candidates.push({ rows, total, cost: Math.abs(Math.log(total / H)) + spread * 0.3 });
  };

  if (n <= 14) {
    // 改行位置を総当たり
    for (let mask = 0; mask < 1 << (n - 1); mask++) {
      const breaks = [];
      let count = 1;
      for (let b = 0; b < n - 1; b++) {
        if (mask & (1 << b)) {
          breaks.push(count);
          count = 1;
        } else count++;
      }
      breaks.push(count);
      evaluate(breaks);
    }
  } else {
    for (let k = 1; k <= Math.min(n, 8); k++) {
      const base = Math.floor(n / k);
      const extra = n % k;
      evaluate(Array.from({ length: k }, (_, r) => base + (r < extra ? 1 : 0)));
    }
  }

  candidates.sort((a, b) => a.cost - b.cost);
  const chosen = candidates[variant % Math.min(candidates.length, 8)];
  const scaleY = H / chosen.total;
  const out = [];
  let y = 0;
  for (const row of chosen.rows) {
    const rh = row.h * scaleY;
    const sum = row.as.reduce((s, a) => s + a, 0);
    let x = 0;
    row.as.forEach((a, k) => {
      const w = (W * a) / sum;
      out[row.start + k] = { x, y, w, h: rh, label: '' };
      x += w;
    });
    y += rh;
  }
  return out;
}

// ==================== 段組み（メイソンリー） ====================

function buildMasonry(aspects, variant) {
  const n = aspects.length;
  const options = [];
  for (let k = 1; k <= Math.min(n, 8); k++) {
    const colW = W / k;
    const cols = Array.from({ length: k }, () => ({ h: 0, items: [] }));
    aspects.forEach((a, i) => {
      const c = cols.reduce((m, col, idx) => (col.h < cols[m].h ? idx : m), 0);
      cols[c].items.push({ i, h: colW / a });
      cols[c].h += colW / a;
    });
    if (cols.some((c) => c.items.length === 0)) continue;
    const cost = cols.reduce((s, c) => s + Math.abs(Math.log(c.h / H)), 0) / k;
    options.push({ k, colW, cols, cost });
  }
  options.sort((a, b) => a.cost - b.cost);
  const chosen = options[variant % options.length];
  const out = [];
  chosen.cols.forEach((col, c) => {
    const sy = H / col.h;
    let y = 0;
    for (const it of col.items) {
      out[it.i] = { x: c * chosen.colW, y, w: chosen.colW, h: it.h * sy, label: '' };
      y += it.h * sy;
    }
  });
  return out;
}

// ==================== 主役＋脇役 ====================

function gridIn(x, y, w, h, count) {
  if (count <= 0) return [];
  const cols = count <= 3 ? 1 : 2;
  const rows = Math.ceil(count / cols);
  const out = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, count - r * cols);
    for (let c = 0; c < inRow; c++) {
      out.push({ x: x + (c * w) / inRow, y: y + (r * h) / rows, w: w / inRow, h: h / rows, label: '' });
    }
  }
  return out;
}

function buildHero(n, pos) {
  if (n <= 1) return [{ x: 0, y: 0, w: W, h: H, label: '' }];
  const others = n - 1;
  if (pos === 'center' && others >= 2) {
    const heroW = W * 0.5;
    const sideW = (W - heroW) / 2;
    const left = Math.ceil(others / 2);
    const right = others - left;
    return [
      { x: sideW, y: 0, w: heroW, h: H, label: '' },
      ...gridIn(0, 0, sideW, H, left),
      ...gridIn(sideW + heroW, 0, sideW, H, right),
    ];
  }
  const heroW = W * 0.62;
  const heroX = pos === 'right' ? W - heroW : 0;
  const subX = pos === 'right' ? 0 : heroW;
  return [{ x: heroX, y: 0, w: heroW, h: H, label: '' }, ...gridIn(subX, 0, W - heroW, H, others)];
}

// ==================== 黄金比（フィボナッチ分割） ====================

function buildGolden(n) {
  const PHI_INV = 0.618;
  let rect = { x: 0, y: 0, w: W, h: H };
  const out = [];
  let hCount = 0;
  let vCount = 0;
  for (let i = 0; i < n - 1; i++) {
    if (rect.w >= rect.h) {
      const pw = rect.w * PHI_INV;
      const fromLeft = hCount++ % 2 === 0;
      out.push({ x: fromLeft ? rect.x : rect.x + rect.w - pw, y: rect.y, w: pw, h: rect.h, label: '' });
      rect = { x: fromLeft ? rect.x + pw : rect.x, y: rect.y, w: rect.w - pw, h: rect.h };
    } else {
      const ph = rect.h * PHI_INV;
      const fromTop = vCount++ % 2 === 0;
      out.push({ x: rect.x, y: fromTop ? rect.y : rect.y + rect.h - ph, w: rect.w, h: ph, label: '' });
      rect = { x: rect.x, y: fromTop ? rect.y + ph : rect.y, w: rect.w, h: rect.h - ph };
    }
  }
  out.push({ ...rect, label: '' });
  return out;
}

// ==================== サークル（中心＋周囲） ====================

function buildRadial(n) {
  const circle = (cx, cy, r) => ({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, label: '', shape: 'circle' });
  if (n <= 1) return [circle(W / 2, H / 2, H / 2)];

  if (n === 2) {
    // 2枚: 大小の円を横に並べて幅いっぱいに
    const R = H / 2;
    const r = Math.min(H / 2 * 0.85, (W - 24 - R * 2) / 2);
    const total = R * 2 + 24 + r * 2;
    const x0 = (W - total) / 2;
    return [circle(x0 + R, H / 2, R), circle(x0 + R * 2 + 24 + r, H / 2, r)];
  }

  const sats = n - 1;
  // 中心円は周りの円の何倍の半径にするか（枚数が多いほど主役を大きく）
  const ratio = sats <= 2 ? 1.15 : sats <= 4 ? 1.45 : 1.65;
  const margin = 24; // 円どうしの最小間隔

  // 半径 r の円がキャンバス内で重ならずに並べられるかを、押し合いで確かめる
  const tryRadius = (r, offset) => {
    const R = r * ratio;
    if (R * 2 > H) return null;
    const radii = [R, ...Array(sats).fill(r)];
    const pts = [[W / 2, H / 2]];
    for (let k = 0; k < sats; k++) {
      const t = (Math.PI * 2 * k) / sats + offset;
      pts.push([W / 2 + (W / 2 - r) * Math.cos(t), H / 2 + (H / 2 - r) * Math.sin(t)]);
    }
    const clamp = (i) => {
      const ri = radii[i];
      pts[i][0] = Math.min(W - ri, Math.max(ri, pts[i][0]));
      pts[i][1] = Math.min(H - ri, Math.max(ri, pts[i][1]));
    };
    for (let iter = 0; iter < 300; iter++) {
      let worst = 0;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          let dx = pts[j][0] - pts[i][0];
          let dy = pts[j][1] - pts[i][1];
          let d = Math.hypot(dx, dy);
          if (d < 1e-6) {
            dx = Math.cos(j);
            dy = Math.sin(j);
            d = 1;
          }
          const over = radii[i] + radii[j] + margin - d;
          if (over <= 0) continue;
          worst = Math.max(worst, over);
          // 中心円は動かさない（主役を中央に固定）
          const wi = i === 0 ? 0 : 0.5;
          const wj = 1 - wi;
          pts[i][0] -= (dx / d) * over * wi;
          pts[i][1] -= (dy / d) * over * wi;
          pts[j][0] += (dx / d) * over * wj;
          pts[j][1] += (dy / d) * over * wj;
          clamp(i);
          clamp(j);
        }
      }
      if (worst < 0.5) return { pts, radii };
    }
    return null;
  };

  // 並べ始める角度を何通りか試し、それぞれ収まる最大の半径を二分探索
  let best = null;
  let bestR = 0;
  const offsets = [0, Math.PI / sats, Math.PI / (2 * sats), -Math.PI / 2];
  for (const offset of offsets) {
    let lo = bestR || 40;
    let hi = H / 2 / ratio;
    let found = tryRadius(lo, offset);
    if (!found) continue;
    for (let k = 0; k < 22; k++) {
      const mid = (lo + hi) / 2;
      const res = tryRadius(mid, offset);
      if (res) {
        found = res;
        lo = mid;
      } else hi = mid;
    }
    if (lo > bestR) {
      bestR = lo;
      best = found;
    }
  }
  if (!best) best = tryRadius(40, 0);

  // まとまり全体をキャンバス中央へ寄せる
  const minX = Math.min(...best.pts.map(([x], i) => x - best.radii[i]));
  const maxX = Math.max(...best.pts.map(([x], i) => x + best.radii[i]));
  const minY = Math.min(...best.pts.map(([, y], i) => y - best.radii[i]));
  const maxY = Math.max(...best.pts.map(([, y], i) => y + best.radii[i]));
  const sx = (W - (maxX - minX)) / 2 - minX;
  const sy = (H - (maxY - minY)) / 2 - minY;
  return best.pts.map(([x, y], i) => circle(x + sx, y + sy, best.radii[i]));
}

// ==================== カレンダー ====================

const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildCalendar(opts) {
  const now = new Date();
  const year = opts.calendarYear || now.getFullYear();
  const month = opts.calendarMonth || now.getMonth() + 1; // 1-12
  const weekStart = opts.calendarWeekStart || 0; // 0=日, 1=月
  const days = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const offset = (firstDow - weekStart + 7) % 7;
  const weeks = Math.ceil((offset + days) / 7);

  const titleH = 230;
  const headH = 90;
  const top = titleH + headH;
  const cellW = W / 7;
  const cellH = (H - top) / weeks;

  const slots = [];
  for (let d = 1; d <= days; d++) {
    const idx = offset + d - 1;
    slots.push({
      x: (idx % 7) * cellW,
      y: top + Math.floor(idx / 7) * cellH,
      w: cellW,
      h: cellH,
      label: String(d),
      labelStyle: 'corner-tl',
      placeholderStyle: 'subtle',
      date: { y: year, m: month, d },
    });
  }
  const blanks = [];
  for (let idx = 0; idx < weeks * 7; idx++) {
    if (idx < offset || idx >= offset + days) {
      blanks.push({ x: (idx % 7) * cellW, y: top + Math.floor(idx / 7) * cellH, w: cellW, h: cellH });
    }
  }
  const weekdays = Array.from({ length: 7 }, (_, c) => {
    const dow = (c + weekStart) % 7;
    return {
      x: c * cellW, y: titleH, w: cellW, h: headH,
      label: WEEK_EN[dow],
      color: dow === 0 ? '#ff8a8a' : dow === 6 ? '#8ab4ff' : null,
    };
  });
  return {
    rows: null, cols: null, slots,
    hasLabels: true, labelsEditable: false, dynamic: true, calendar: true,
    decor: {
      type: 'calendar',
      title: `${year}.${String(month).padStart(2, '0')}`,
      sub: MONTH_EN[month - 1],
      titleRect: { x: 0, y: 0, w: W, h: titleH },
      weekdays,
      blanks,
    },
  };
}

// ==================== フィルムストリップ ====================

function buildFilm(n) {
  const rows = n <= 5 ? 1 : 2;
  const perRow = Math.ceil(n / rows);
  const spacing = 60;
  const frameAspect = 3 / 2;
  let frameW = (W - spacing * (perRow + 1)) / perRow;
  let frameH = frameW / frameAspect;
  let margin = frameH * 0.22;
  let stripH = frameH + margin * 2;
  const rowGap = 80;
  const maxTotal = H * 0.94;
  const total = rows * stripH + (rows - 1) * rowGap;
  if (total > maxTotal) {
    const s = maxTotal / total;
    frameW *= s;
    frameH *= s;
    margin *= s;
    stripH *= s;
  }
  const startY = (H - (rows * stripH + (rows - 1) * rowGap)) / 2;
  const slots = [];
  const strips = [];
  let num = 1;
  for (let r = 0; r < rows; r++) {
    const count = Math.min(perRow, n - r * perRow);
    const y = startY + r * (stripH + rowGap);
    const rowW = count * frameW + (count - 1) * spacing;
    let x = (W - rowW) / 2;
    const frames = [];
    for (let k = 0; k < count; k++) {
      slots.push({ x, y: y + margin, w: frameW, h: frameH, label: '' });
      frames.push({ x, w: frameW, n: num++ });
      x += frameW + spacing;
    }
    strips.push({ x: 0, y, w: W, h: stripH, margin, frames });
  }
  return { rows: null, cols: null, slots, hasLabels: false, dynamic: true, decor: { type: 'film', strips } };
}

// ==================== ポラロイド（散らし置き） ====================

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPolaroid(n, tilt, seed) {
  // カード: 幅 = 1.12s、高さ = 1.30s（s は写真部分の一辺）。写真が一番大きくなる行列数を選ぶ
  const fit = (cols) => {
    const rows = Math.ceil(n / cols);
    return Math.min((W / cols) * 0.9 / 1.12, (H / rows) * 0.88 / 1.3);
  };
  let cols = 1;
  for (let c = 2; c <= n; c++) if (fit(c) > fit(cols)) cols = c;
  const rows = Math.ceil(n / cols);
  const cellW = W / cols;
  const cellH = H / rows;
  const s = fit(cols);
  const rand = mulberry32(seed * 9973);
  const slots = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    const c = i - r * cols;
    const rowOffset = ((cols - inRow) * cellW) / 2;
    const jx = (rand() - 0.5) * Math.max(0, cellW - s * 1.12) * 0.8;
    const jy = (rand() - 0.5) * Math.max(0, cellH - s * 1.3) * 0.6;
    const cx = rowOffset + (c + 0.5) * cellW + jx;
    const cy = (r + 0.5) * cellH + jy - s * 0.09;
    slots.push({
      x: cx - s / 2,
      y: cy - s / 2,
      w: s,
      h: s,
      label: '',
      labelStyle: 'polaroid',
      frame: 'polaroid',
      angle: (rand() * 2 - 1) * tilt,
    });
  }
  return { rows: null, cols: null, slots, hasLabels: true, labelsEditable: true, captionLabels: true, dynamic: true };
}

// ==================== 斜め分割 ====================

function buildDiagonal(n, slant) {
  const tops = [0];
  const bottoms = [0];
  for (let i = 1; i < n; i++) {
    tops.push((W * i) / n + slant / 2);
    bottoms.push((W * i) / n - slant / 2);
  }
  tops.push(W);
  bottoms.push(W);
  const out = [];
  for (let i = 0; i < n; i++) {
    const poly = [
      [tops[i], 0],
      [tops[i + 1], 0],
      [bottoms[i + 1], H],
      [bottoms[i], H],
    ];
    const minX = Math.min(tops[i], bottoms[i]);
    const maxX = Math.max(tops[i + 1], bottoms[i + 1]);
    out.push({ x: minX, y: 0, w: maxX - minX, h: H, label: '', shape: 'poly', poly });
  }
  return out;
}

// ==================== デザインテンプレート ====================

/** 写真の比率を保ったまま (bw, bh) の箱に収める */
function contain(aspect, bw, bh) {
  return aspect > bw / bh ? { w: bw, h: bw / aspect } : { w: bh * aspect, h: bh };
}

const MONTH_EN_SHORT = MONTH_EN;

export function defaultDesignTitle(template, photos) {
  const d = photos.find((p) => p.date)?.date;
  const now = new Date();
  const y = d?.y || now.getFullYear();
  const m = d?.m || now.getMonth() + 1;
  switch (template) {
    case 'minimal':
      return `${MONTH_EN_SHORT[m - 1]}, ${y}`;
    case 'timeline':
      return d ? `${d.m}/${d.d} ワールド巡り` : 'ワールド巡り';
    case 'scrapbook':
      return 'たのしかった！';
    default:
      return '';
  }
}

function designTitle(opts, template, photos) {
  const t = opts.designTitles?.[template];
  return t != null ? t : defaultDesignTitle(template, photos);
}

// ---------- ハニカム ----------

function buildHoneycomb(n) {
  const SQ3 = Math.sqrt(3);
  let best = null;
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    const R = Math.min(H / (2 + 1.5 * (rows - 1)), W / (SQ3 * (cols + (rows > 1 ? 0.5 : 0))));
    if (!best || R > best.R) best = { rows, cols, R };
  }
  const { rows, cols, R } = best;
  const hw = SQ3 * R;
  const totalW = hw * (cols + (rows > 1 ? 0.5 : 0));
  const totalH = 2 * R + 1.5 * R * (rows - 1);
  const x0 = (W - totalW) / 2 + hw / 2;
  const y0 = (H - totalH) / 2 + R;
  const inner = R - 6; // 六角形どうしの細い隙間
  const out = [];
  let i = 0;
  for (let r = 0; r < rows && i < n; r++) {
    const count = Math.min(cols, n - i);
    const shift = Math.floor((cols - count) / 2) * hw;
    for (let c = 0; c < count; c++, i++) {
      const cx = x0 + shift + c * hw + (r % 2 ? hw / 2 : 0);
      const cy = y0 + r * 1.5 * R;
      const poly = Array.from({ length: 6 }, (_, k) => {
        const a = ((60 * k - 30) * Math.PI) / 180;
        return [cx + inner * Math.cos(a), cy + inner * Math.sin(a)];
      });
      out.push({ x: cx - inner * SQ3 / 2, y: cy - inner, w: inner * SQ3, h: inner * 2, label: '', shape: 'poly', poly });
    }
  }
  return out;
}

// ---------- 菱形 ----------

function buildDiamond(n) {
  let best = null;
  for (let rows = 1; rows <= n; rows++) {
    const cols = Math.ceil(n / rows);
    // S = 菱形の中心から頂点までの距離
    const S = Math.min(H / (2 + (rows - 1)), W / (2 * cols + (rows > 1 ? 1 : 0)));
    if (!best || S > best.S) best = { rows, cols, S };
  }
  const { rows, cols, S } = best;
  const totalW = 2 * S * cols + (rows > 1 ? S : 0);
  const totalH = 2 * S + S * (rows - 1);
  const x0 = (W - totalW) / 2 + S;
  const y0 = (H - totalH) / 2 + S;
  const inner = S - 8;
  const out = [];
  let i = 0;
  for (let r = 0; r < rows && i < n; r++) {
    const count = Math.min(cols, n - i);
    const shift = Math.floor((cols - count) / 2) * 2 * S;
    for (let c = 0; c < count; c++, i++) {
      const cx = x0 + shift + c * 2 * S + (r % 2 ? S : 0);
      const cy = y0 + r * S;
      const poly = [[cx, cy - inner], [cx + inner, cy], [cx, cy + inner], [cx - inner, cy]];
      out.push({ x: cx - inner, y: cy - inner, w: inner * 2, h: inner * 2, label: '', shape: 'poly', poly });
    }
  }
  return out;
}

// ---------- 余白多めのミニマル ----------

function buildMinimal(aspects, opts, photos) {
  const n = aspects.length;
  const cols = n <= 4 ? n : Math.ceil(n / 2);
  const rows = n <= 4 ? 1 : 2;
  const left = W * 0.08;
  const top = H * 0.2;
  const areaW = W * 0.84;
  const areaH = H * 0.75;
  const gapX = W * 0.03;
  const gapY = H * 0.035;
  const cellW = (areaW - gapX * (cols - 1)) / cols;
  const cellH = (areaH - gapY * (rows - 1)) / rows;
  const captionH = 150;
  const slots = aspects.map((a, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const box = contain(a, cellW, cellH - captionH);
    return {
      x: left + c * (cellW + gapX) + (cellW - box.w) / 2,
      y: top + r * (cellH + gapY) + (cellH - captionH - box.h),
      w: box.w,
      h: box.h,
      label: '',
      labelStyle: 'below',
      subKind: 'date',
    };
  });
  const paper = opts.paperColors?.minimal || '#f3efe7';
  return {
    rows: null, cols: null, slots,
    hasLabels: true, labelsEditable: true, captionLabels: true, dynamic: true,
    decor: {
      type: 'design',
      paper,
      title: {
        text: designTitle(opts, 'minimal', photos),
        x: left, y: H * 0.11, size: 96, color: '#3c3228', align: 'left',
      },
    },
  };
}

// ---------- 背景＋フレーム写真 ----------

function buildBgFrame(aspects, opts) {
  const n = aspects.length;
  const bg = { x: 0, y: 0, w: W, h: H, label: '', blur: n > 1 ? opts.bgBlur ?? 36 : 0, dim: n > 1 ? (opts.bgDim ?? 25) / 100 : 0 };
  if (n === 1) return [bg];
  const cards = aspects.slice(1);
  const m = cards.length;
  const rows = m <= 4 ? 1 : 2;
  const perRow = Math.ceil(m / rows);
  const areaX = W * 0.07;
  const areaY = H * (rows === 1 ? 0.14 : 0.08);
  const areaW = W * 0.86;
  const areaH = H * (rows === 1 ? 0.72 : 0.84);
  const cellW = areaW / perRow;
  const cellH = areaH / rows;
  const angles = [-5, 3, -2, 4, -4, 2];
  const out = [bg];
  cards.forEach((a, k) => {
    const r = Math.floor(k / perRow);
    const inRow = Math.min(perRow, m - r * perRow);
    const c = k - r * perRow;
    const rowShift = ((perRow - inRow) * cellW) / 2;
    const box = contain(a, cellW * 0.8, cellH * 0.8);
    const cx = areaX + rowShift + (c + 0.5) * cellW;
    const cy = areaY + (r + 0.5) * cellH;
    out.push({
      x: cx - box.w / 2, y: cy - box.h / 2, w: box.w, h: box.h,
      label: '', frame: 'card', angle: angles[k % angles.length],
    });
  });
  return out;
}

// ---------- タイムライン ----------

function buildTimeline(aspects, opts, photos) {
  const n = aspects.length;
  const lineY = H * 0.53;
  const margin = W * 0.05;
  const step = (W - margin * 2) / n;
  const capH = 120; // キャプション
  const timeH = 110; // 時刻＋線までの余白
  const topLimit = H * 0.16;
  const boxH = lineY - timeH - topLimit - capH;
  const boxW = Math.min(n === 1 ? W * 0.5 : step * 1.8, W * 0.42);
  const slots = [];
  const points = [];
  aspects.forEach((a, k) => {
    const up = k % 2 === 0;
    const cx = margin + step * (k + 0.5);
    const box = contain(a, boxW * 0.95, boxH);
    const y = up ? lineY - timeH - box.h : lineY + timeH;
    // 端の写真がキャンバスからはみ出さないように寄せる
    const x = Math.min(W - margin * 0.4 - box.w, Math.max(margin * 0.4, cx - box.w / 2));
    slots.push({
      x, y, w: box.w, h: box.h,
      label: '', labelStyle: up ? 'timeline-up' : 'timeline-down', subKind: 'time',
      anchorX: cx,
    });
    points.push({ x: cx, from: up ? y + box.h : y });
  });
  return {
    rows: null, cols: null, slots,
    hasLabels: true, labelsEditable: true, captionLabels: true, dynamic: true,
    decor: {
      type: 'design',
      timeline: { y: lineY, x0: margin * 0.6, x1: W - margin * 0.6, points },
      title: {
        text: designTitle(opts, 'timeline', photos),
        x: margin * 0.6, y: H * 0.06, size: 80, color: null, align: 'left',
      },
    },
  };
}

// ---------- スクラップブック ----------

function buildScrapbook(aspects, opts, photos, seed) {
  const n = aspects.length;
  const rand = mulberry32(seed * 7919 + 13);
  let cols = 1;
  const fit = (c) => Math.min(W / c, (H * 0.9) / Math.ceil(n / c));
  for (let c = 2; c <= n; c++) if (fit(c) > fit(cols)) cols = c;
  const rows = Math.ceil(n / cols);
  const cellW = W / cols;
  const cellH = (H * 0.9) / rows;
  const slots = aspects.map((a, i) => {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    const c = i - r * cols;
    const rowShift = ((cols - inRow) * cellW) / 2;
    const scale = 0.88 + rand() * 0.24;
    const box = contain(a, cellW * 0.78 * scale, cellH * 0.7 * scale);
    const cx = rowShift + (c + 0.5) * cellW + (rand() - 0.5) * cellW * 0.16;
    const cy = (r + 0.5) * cellH + (rand() - 0.5) * cellH * 0.14;
    return {
      x: cx - box.w / 2, y: cy - box.h / 2, w: box.w, h: box.h,
      label: '', labelStyle: 'hand', frame: 'card',
      angle: (rand() * 2 - 1) * 9,
      tape: { angle: (rand() * 2 - 1) * 12, offset: (rand() - 0.5) * 0.4 },
    };
  });
  const colors = ['#ffc800', '#78c8ff', '#ff7aa8', '#8be08b'];
  const stickers = Array.from({ length: Math.min(6, 2 + Math.ceil(n / 2)) }, (_, k) => ({
    x: W * (0.06 + rand() * 0.88),
    y: H * (0.06 + rand() * 0.86),
    r: 50 + rand() * 50,
    color: colors[k % colors.length],
    kind: k % 3 === 2 ? 'heart' : 'star',
    angle: rand() * 40 - 20,
  }));
  const paper = opts.paperColors?.scrapbook || '#eee2cd';
  return {
    rows: null, cols: null, slots,
    hasLabels: true, labelsEditable: true, captionLabels: true, dynamic: true,
    decor: {
      type: 'design',
      paper,
      stickers,
      titleAfter: true,
      title: {
        text: designTitle(opts, 'scrapbook', photos),
        x: W * 0.04, y: H * 0.93, size: 120, color: '#c83c5a', align: 'left',
        font: 'hand', angle: -3,
      },
    },
  };
}
