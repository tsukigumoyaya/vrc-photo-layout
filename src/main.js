import './style.css';
import {
  LAYOUTS,
  getLayoutMax,
  getTemplateConfig,
  getCustomGridConfig,
  getMonthlyPatternName,
  defaultDesignTitle,
} from './templates.js';
import {
  render,
  renderForExport,
  hitTestSlot,
  hitTestDeleteButton,
  getSlotGeometry,
  getCoverBox,
} from './renderer.js';

// ==================== State ====================

function formatDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const state = {
  template: 'weekly',
  gridMode: 'preset',
  rows: 1,
  cols: 5,
  photos: [],
  slots: [],
  gap: 0,
  bgColor: '#000000',
  fontSize: 48,
  fontColor: '#ffffff',
  fontBold: false,
  labelBgOpacity: 0.5,
  labelBgSyncColor: true,
  labelBgColor: '#ffffff',
  overlayEnabled: false,
  overlayText: `#VRC12Photos ${new Date().getFullYear()}`,
  overlayPosition: 'top-left',
  overlayColor: '#ffffff',
  overlayFontSize: 72,
  format: 'png',
  jpegQuality: 100,
  filename: `weekly_${formatDate()}`,
  monthlyPattern: null,
  hoveredSlot: -1,
  swapSource: -1,
  swapTarget: -1,
  // レイアウト状態
  hasLabels: true,
  labelsEditable: true,
  dynamic: false,
  decor: null,
  layoutVariant: 0,
  // レイアウト設定
  heroPos: 'left',
  diagonalSlant: 300,
  polaroidTilt: 6,
  polaroidSeed: 1,
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth() + 1,
  calendarWeekStart: 0,
  calendarOutside: 0,
  calendarDup: 0,
  // デザインテンプレート
  captionLabels: false,
  designTitles: {},
  paperColors: { minimal: '#f3efe7', scrapbook: '#eee2cd' },
  bgBlur: 36,
  bgDim: 25,
};

// ==================== DOM ====================

const $ = (id) => document.getElementById(id);
const canvas = $('preview-canvas');
const previewContainer = $('preview-container');
const fileInput = $('file-input');

// ==================== Canvas sizing ====================

function resizeCanvas() {
  const rect = previewContainer.getBoundingClientRect();
  // ライトテーブルの縁＋台紙の分だけ内側に収める
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  const margin = narrow ? 28 : 72;
  const maxW = Math.max(160, rect.width - margin);
  const maxH = Math.max(90, rect.height - margin);

  let w = maxW;
  let h = w * (9 / 16);
  if (h > maxH) {
    h = maxH;
    w = h * (16 / 9);
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  previewContainer.style.setProperty('--cw', `${Math.round(w)}px`);
  previewContainer.style.setProperty('--ch', `${Math.round(h)}px`);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  // 削除ボタンを画面上で一定サイズ以上に保つ（タッチは指で押せる大きさに）
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const minCssRadius = coarse ? 14 : 9;
  state.deleteBtnR = Math.max(30, minCssRadius * (3840 / w));

  renderPreview();
}

// ==================== Rendering ====================

function renderPreview() {
  render(canvas, state);
}

// ==================== Template management ====================

const PRESET_TEMPLATES = ['weekly', 'monthly', 'yearly'];

function newSlot(s) {
  return { ...s, photo: null, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
}

/**
 * テンプレートを適用する
 * keep=true のときは同じテンプレートの組み直し（ファイル名・バリエーションを維持）
 */
/** 切り替え前の絵を一瞬残して溶かし、何が変わったかを見せる */
function ghostCurrentCanvas() {
  if (!canvas.width || state.photos.length === 0) return;
  const mount = $('mount');
  mount.querySelectorAll('.ghost').forEach((g) => g.remove());
  const ghost = document.createElement('canvas');
  ghost.className = 'ghost';
  ghost.width = canvas.width;
  ghost.height = canvas.height;
  ghost.getContext('2d').drawImage(canvas, 0, 0);
  ghost.setAttribute('aria-hidden', 'true');
  mount.append(ghost);
  ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
}

function setTemplate(name, keep = false) {
  const changed = state.template !== name || state.gridMode !== 'preset';
  if (changed && !keep) ghostCurrentCanvas();
  state.template = name;
  state.gridMode = 'preset';
  if (changed && !keep) state.layoutVariant = 0;

  // 写真ごとの位置調整を保存しておき、組み直し後に戻す
  const savedAdj = new Map();
  for (const slot of state.slots) {
    if (slot.photo) {
      savedAdj.set(slot.photo, {
        offsetX: slot.offsetX,
        offsetY: slot.offsetY,
        scale: slot.scale,
        rotation: slot.rotation,
      });
    }
  }
  const prevLabels = !changed ? state.slots.map((s) => s.label) : null;

  if (name === 'calendar' && changed && !keep) pickCalendarMonth();

  const config = getTemplateConfig(name, state.photos, state);
  state.slots = config.slots.map(newSlot);
  state.hasLabels = !!config.hasLabels;
  state.labelsEditable = !!config.labelsEditable;
  state.dynamic = !!config.dynamic;
  state.decor = config.decor || null;
  state.captionLabels = !!config.captionLabels;

  if (config.rows != null) state.rows = config.rows;
  if (config.cols != null) state.cols = config.cols;

  state.monthlyPattern = name === 'monthly' ? config.pattern || null : null;
  if (name === 'monthly') assignMonthlyPhotos();
  else if (name === 'calendar') assignCalendarPhotos();
  else assignPhotosInOrder();

  for (const slot of state.slots) {
    if (slot.photo && savedAdj.has(slot.photo)) Object.assign(slot, savedAdj.get(slot.photo));
  }

  // ラベル: ポラロイドは写真ごとのキャプション、固定テンプレートは編集内容を維持
  if (state.captionLabels) {
    state.slots.forEach((s) => (s.label = s.photo?.caption || ''));
  } else if (prevLabels && !state.dynamic && prevLabels.length === state.slots.length) {
    state.slots.forEach((s, i) => (s.label = prevLabels[i]));
  }

  fillSubLabels();

  if (changed && !keep) state.filename = `${name}_${formatDate()}`;
  updateAllUI();
  renderPreview();
}

/** 撮影日・時刻の補助ラベル（ミニマル・タイムライン） */
function fillSubLabels(slots = state.slots) {
  const pad = (v) => String(v).padStart(2, '0');
  for (const s of slots) {
    if (!s.subKind) continue;
    const d = s.photo?.date;
    if (!d) {
      s.sublabel = '';
    } else if (s.subKind === 'date') {
      s.sublabel = `${d.y}.${pad(d.m)}.${pad(d.d)}`;
    } else {
      s.sublabel = d.hh != null ? `${pad(d.hh)}:${pad(d.mm)}` : '';
    }
  }
}

/** タイムライン用: 撮影日時の順に写真を並べ替える */
function sortPhotosByTime() {
  const key = (p) => {
    const d = p.date;
    if (!d) return Infinity;
    return ((((d.y * 13 + d.m) * 32 + d.d) * 24 + (d.hh ?? 0)) * 60 + (d.mm ?? 0)) * 60 + (d.ss ?? 0);
  };
  state.photos.sort((a, b) => key(a) - key(b));
  relayout();
  showToast('撮影時刻の順に並べ替えました', 1500);
}

/** 写真の増減・入れ替え後に同じテンプレートで組み直す */
function relayout() {
  setTemplate(state.template, true);
}

function setCustomGrid(rows, cols) {
  ghostCurrentCanvas();
  state.gridMode = 'custom';
  state.rows = rows;
  state.cols = cols;

  const config = getCustomGridConfig(rows, cols);
  state.slots = config.slots.map(newSlot);
  state.hasLabels = true;
  state.labelsEditable = true;
  state.dynamic = false;
  state.decor = null;
  state.monthlyPattern = null;

  assignPhotosInOrder();
  updateAllUI();
  renderPreview();
}

function assignPhotosInOrder(slots = state.slots) {
  for (let i = 0; i < slots.length; i++) {
    Object.assign(slots[i], {
      photo: state.photos[i] || null, offsetX: 0, offsetY: 0, scale: 1, rotation: 0,
    });
  }
}

function assignMonthlyPhotos(slots = state.slots) {
  const photos = state.photos.slice(0, slots.length);
  if (photos.length === 0) return;

  const vPhotos = photos.filter((p) => p.naturalHeight > p.naturalWidth);
  const hPhotos = photos.filter((p) => p.naturalWidth >= p.naturalHeight);

  const vSlotIndices = [];
  const hSlotIndices = [];
  slots.forEach((s, i) => {
    if (s.slotType === 'portrait') vSlotIndices.push(i);
    else hSlotIndices.push(i);
  });

  let vi = 0;
  let hi = 0;
  for (const idx of vSlotIndices) {
    const photo = vPhotos[vi++] || hPhotos[hi++] || null;
    Object.assign(slots[idx], { photo, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
  }
  for (const idx of hSlotIndices) {
    const photo = hPhotos[hi++] || vPhotos[vi++] || null;
    Object.assign(slots[idx], { photo, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
  }
}

// ---------- Calendar ----------

function photoDate(p) {
  return p.dayOverride || p.date || null;
}

/** 写真の撮影日で一番多い月をカレンダーの月にする */
function pickCalendarMonth() {
  const counts = new Map();
  for (const p of state.photos) {
    const d = photoDate(p);
    if (!d) continue;
    const key = `${d.y}-${d.m}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size === 0) return;
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const [y, m] = best.split('-').map(Number);
  state.calendarYear = y;
  state.calendarMonth = m;
}

function assignCalendarPhotos(slots = state.slots, record = true) {
  const byDay = new Map(slots.map((s, i) => [s.date.d, i]));
  let outside = 0;
  let dup = 0;
  for (const p of state.photos) {
    const d = photoDate(p);
    if (!d || d.y !== state.calendarYear || d.m !== state.calendarMonth) {
      outside++;
      continue;
    }
    const idx = byDay.get(d.d);
    if (idx === undefined) continue;
    if (slots[idx].photo) {
      dup++;
      continue;
    }
    slots[idx].photo = p;
  }
  if (record) {
    state.calendarOutside = outside;
    state.calendarDup = dup;
  }
}

// ==================== Photo loading ====================

/** VRChat のファイル名（VRChat_2026-10-01_21-30-12.345_3840x2160.png）または更新日時から撮影日を得る */
function extractDate(file) {
  const m = file.name.match(/(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?:[_\sT-]+(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2}))?/);
  if (m) {
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      const out = { y, m: mo, d };
      if (m[4] && +m[4] < 24 && +m[5] < 60) Object.assign(out, { hh: +m[4], mm: +m[5], ss: +m[6] });
      else if (file.lastModified) {
        const dt = new Date(file.lastModified);
        Object.assign(out, { hh: dt.getHours(), mm: dt.getMinutes(), ss: dt.getSeconds() });
      }
      return out;
    }
  }
  if (file.lastModified) {
    const dt = new Date(file.lastModified);
    return {
      y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(),
      hh: dt.getHours(), mm: dt.getMinutes(), ss: dt.getSeconds(),
    };
  }
  return null;
}

/** レイアウト一覧などの小さな描画用に縮小版を作る */
function makeThumb(img) {
  const sc = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(img.naturalWidth * sc));
  t.height = Math.max(1, Math.round(img.naturalHeight * sc));
  const c = t.getContext('2d');
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, t.width, t.height);
  return t;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        img,
        thumb: makeThumb(img),
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        name: file.name,
        date: extractDate(file),
        caption: '',
      });
    img.onerror = () => reject(new Error(`Failed to load: ${file.name}`));
    img.src = url;
  });
}

let replaceSlotIndex = -1;

async function handleFiles(files) {
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));
  if (imageFiles.length === 0) return;

  const loaded = await Promise.all(imageFiles.map(loadImage));
  const wasEmpty = state.photos.length === 0;

  if (replaceSlotIndex >= 0) {
    const slot = state.slots[replaceSlotIndex];
    const oldPhoto = slot.photo;
    const photo = loaded[0];
    if (slot.date) photo.dayOverride = { ...slot.date };
    Object.assign(slot, { photo, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
    if (oldPhoto) {
      const pi = state.photos.indexOf(oldPhoto);
      if (pi >= 0) state.photos[pi] = photo;
      else state.photos.push(photo);
    } else {
      // 空きスロットへの追加は、そのスロットの順番に差し込む（動的レイアウトの並び順を保つ）
      const before = state.slots.slice(0, replaceSlotIndex).filter((s) => s.photo).length;
      state.photos.splice(state.dynamic && !slot.date ? before : state.photos.length, 0, photo);
    }
    replaceSlotIndex = -1;
    if (state.dynamic) relayout();
  } else {
    state.photos.push(...loaded);
    autoSuggestTemplate(loaded.length);
  }

  if (state.template === 'calendar' && state.gridMode === 'preset' && state.calendarOutside > 0) {
    showToast(`${state.calendarOutside}枚は${state.calendarMonth}月以外の写真のため表示していません`);
  }

  renderPreview();
  updateAllUI();
  if (wasEmpty && state.photos.length > 0) playDevelop();
}

/** 最初の写真が入ったときに一度だけ、印画紙が現像されるように見せる */
function playDevelop() {
  const mount = $('mount');
  mount.classList.remove('developing');
  void mount.offsetWidth;
  mount.classList.add('developing');
  mount.addEventListener('animationend', () => mount.classList.remove('developing'), { once: true });
}

function autoSuggestTemplate(addedCount) {
  const total = state.photos.length;
  const onPreset = state.gridMode === 'preset' && PRESET_TEMPLATES.includes(state.template);

  if (onPreset && total === 5 && addedCount === 5) {
    setTemplate('weekly');
    showToast('5枚なので Weekly に切り替えました');
  } else if (onPreset && total === 4 && addedCount === 4 && state.template !== 'monthly') {
    setTemplate('monthly');
    const pn = getMonthlyPatternName(state.monthlyPattern);
    showToast(`4枚なので Monthly（${pn}）に切り替えました`);
  } else if (onPreset && total === 12 && addedCount === 12) {
    setTemplate('yearly');
    showToast('12枚なので Yearly に切り替えました');
  } else if (state.dynamic && state.gridMode === 'preset') {
    relayout();
    const max = getLayoutMax(state.template);
    if (max && total > max) showToast(`このレイアウトは最大${max}枚です（${total - max}枚は非表示）`);
  } else {
    fillEmptySlots();
  }
}

function fillEmptySlots() {
  const assigned = new Set();
  for (const slot of state.slots) {
    if (slot.photo) {
      const idx = state.photos.indexOf(slot.photo);
      if (idx >= 0) assigned.add(idx);
    }
  }
  const unassigned = state.photos.filter((_, i) => !assigned.has(i));
  let ui = 0;
  for (const slot of state.slots) {
    if (!slot.photo && ui < unassigned.length) {
      Object.assign(slot, { photo: unassigned[ui++], offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
    }
  }
}

// ==================== Canvas interactions ====================

let dragState = null;

function mouseToCanvas4K(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 3840;
  const y = ((e.clientY - rect.top) / rect.height) * 2160;
  return [x, y];
}

function snapRotation(deg) {
  const nearest = Math.round(deg / 90) * 90;
  return Math.abs(deg - nearest) < 5 ? nearest : deg;
}

function getSlotDrawSize(slot) {
  if (!slot.photo) return null;
  const g = getSlotGeometry(slot, state);
  const box = getCoverBox(g);
  const img = slot.photo;
  const rad = ((slot.rotation || 0) * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  const reqW = box.w * cosA + box.h * sinA;
  const reqH = box.w * sinA + box.h * cosA;
  const base = Math.max(reqW / img.naturalWidth, reqH / img.naturalHeight);
  const final = base * (slot.scale || 1);
  return {
    sw: box.w,
    sh: box.h,
    drawW: img.naturalWidth * final,
    drawH: img.naturalHeight * final,
  };
}

function snapOffsetXY(offX, offY, drawW, drawH, sw, sh) {
  const T = 40;

  if (Math.abs(offX) < T) offX = 0;
  if (Math.abs(offY) < T) offY = 0;

  if (drawW > sw) {
    const edge = (drawW - sw) / 2;
    if (Math.abs(offX - edge) < T) offX = edge;
    else if (Math.abs(offX + edge) < T) offX = -edge;
  }
  if (drawH > sh) {
    const edge = (drawH - sh) / 2;
    if (Math.abs(offY - edge) < T) offY = edge;
    else if (Math.abs(offY + edge) < T) offY = -edge;
  }
  return [offX, offY];
}

// ---------- Pointer (mouse / touch / pen) ----------
// マウス: ドラッグ=移動 / Shift+ドラッグ=入れ替え / Alt+ドラッグ=回転 / クリック=差し替え
// タッチ: ドラッグ=移動 / 長押し→ドラッグ=入れ替え / 2本指=ズーム+回転
//         タップ=選択（✕表示）→ もう一度タップで差し替え

const LONG_PRESS_MS = 450;
const pointers = new Map(); // pointerId -> { x, y }
let pinchState = null;
let longPressTimer = null;

function clearLongPress() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
}

function slotIndexAtClient(clientX, clientY) {
  const [x, y] = mouseToCanvas4K({ clientX, clientY });
  return hitTestSlot(state.slots, state, x, y);
}

function startSwap(slotIndex) {
  dragState = { type: 'swap', slotIndex, moved: true };
  state.swapSource = slotIndex;
  state.swapTarget = slotIndex;
  renderPreview();
}

function startPinch() {
  clearLongPress();
  const [a, b] = [...pointers.values()];
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const idx = dragState ? dragState.slotIndex : slotIndexAtClient(midX, midY);
  // ピンチ開始前の1本指パンは取り消す
  if (dragState && dragState.type === 'pan') {
    const s = state.slots[dragState.slotIndex];
    s.offsetX = dragState.startOffsetX;
    s.offsetY = dragState.startOffsetY;
  }
  dragState = null;
  resetSwapUI();
  if (idx < 0 || !state.slots[idx].photo) {
    pinchState = { slotIndex: -1 };
    return;
  }
  const slot = state.slots[idx];
  pinchState = {
    slotIndex: idx,
    startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
    startAngle: Math.atan2(b.y - a.y, b.x - a.x),
    startScale: slot.scale || 1,
    startRotation: slot.rotation || 0,
  };
}

function updatePinch() {
  if (!pinchState || pinchState.slotIndex < 0 || pointers.size < 2) return;
  const [a, b] = [...pointers.values()];
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const slot = state.slots[pinchState.slotIndex];
  let scale = pinchState.startScale * (dist / pinchState.startDist);
  if (Math.abs(scale - 1) < 0.04) scale = 1;
  slot.scale = Math.max(0.5, Math.min(3, scale));
  const deltaDeg = ((angle - pinchState.startAngle) * 180) / Math.PI;
  slot.rotation = snapRotation(pinchState.startRotation + deltaDeg);
  renderPreview();
}

function resetSwapUI() {
  state.swapSource = -1;
  state.swapTarget = -1;
}

function swapSlots(a, b) {
  if (a === b || a < 0 || b < 0) return;
  const sa = state.slots[a];
  const sb = state.slots[b];
  // 写真の並び順も入れ替えて、テンプレート切替後も順序を保つ
  const pa = sa.photo ? state.photos.indexOf(sa.photo) : -1;
  const pb = sb.photo ? state.photos.indexOf(sb.photo) : -1;
  if (pa >= 0 && pb >= 0) {
    [state.photos[pa], state.photos[pb]] = [state.photos[pb], state.photos[pa]];
  }
  // カレンダーは移動先の日付に固定する
  if (sa.date && sa.photo) sa.photo.dayOverride = { ...sb.date };
  if (sb.date && sb.photo) sb.photo.dayOverride = { ...sa.date };
  for (const k of ['photo', 'offsetX', 'offsetY', 'scale', 'rotation']) {
    [sa[k], sb[k]] = [sb[k], sa[k]];
  }
  // 移動先のスロット形状が違うので位置だけリセット
  sa.offsetX = sa.offsetY = 0;
  sb.offsetX = sb.offsetY = 0;
  // 空きスロットへ移動した場合（固定テンプレート）は並び順もスロット順に合わせる
  if (pa < 0 || pb < 0) {
    const ordered = state.slots.filter((s) => s.photo).map((s) => s.photo);
    const rest = state.photos.filter((p) => !ordered.includes(p));
    if (!state.dynamic) state.photos = [...ordered, ...rest];
  }
  if (state.dynamic) relayout();
  else updateAllUI();
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // 合成イベントなどでキャプチャできない場合は無視
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    startPinch();
    return;
  }
  if (pointers.size > 2) return;

  const isTouch = e.pointerType !== 'mouse';
  const [x, y] = mouseToCanvas4K(e);
  const prevHovered = state.hoveredSlot;
  const idx = hitTestSlot(state.slots, state, x, y);

  // タッチでは、選択済み（✕が見えている）スロットの✕だけ反応させる
  const deleteIdx = hitTestDeleteButton(state.slots, state, x, y);
  if (deleteIdx >= 0 && (!isTouch || deleteIdx === prevHovered)) {
    dragState = {
      type: 'delete',
      slotIndex: deleteIdx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
    return;
  }

  state.hoveredSlot = idx;
  if (idx < 0) {
    renderPreview();
    return;
  }
  const slot = state.slots[idx];

  if (e.shiftKey && slot.photo) {
    startSwap(idx);
  } else if (e.altKey && slot.photo) {
    dragState = {
      type: 'rotate',
      slotIndex: idx,
      startClientX: e.clientX,
      startRotation: slot.rotation || 0,
      moved: false,
    };
  } else {
    dragState = {
      type: 'pan',
      slotIndex: idx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: slot.offsetX || 0,
      startOffsetY: slot.offsetY || 0,
      moved: false,
      isTouch,
      wasSelected: prevHovered === idx,
    };
    if (isTouch && slot.photo) {
      longPressTimer = setTimeout(() => {
        if (dragState && dragState.type === 'pan' && !dragState.moved && pointers.size === 1) {
          if (navigator.vibrate) navigator.vibrate(20);
          startSwap(idx);
        }
      }, LONG_PRESS_MS);
    }
  }
  renderPreview();
});

function handlePointerMove(e) {
  if (pointers.has(e.pointerId)) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  if (pinchState) {
    updatePinch();
    return;
  }

  // Hover tracking (mouse only)
  if (e.pointerType === 'mouse' && !dragState) {
    const rect = canvas.getBoundingClientRect();
    const onCanvas =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    const newHovered = onCanvas ? slotIndexAtClient(e.clientX, e.clientY) : -1;
    if (newHovered !== state.hoveredSlot) {
      state.hoveredSlot = newHovered;
      renderPreview();
    }
  }

  if (!dragState) return;

  if (dragState.type === 'pan') {
    const dx = e.clientX - dragState.startClientX;
    const dy = e.clientY - dragState.startClientY;
    const threshold = dragState.isTouch ? 8 : 3;
    if (!dragState.moved && (Math.abs(dx) > threshold || Math.abs(dy) > threshold)) {
      dragState.moved = true;
      clearLongPress();
    }
    if (dragState.moved) {
      const s4k = 3840 / canvas.clientWidth;
      const slot = state.slots[dragState.slotIndex];
      if (!slot.photo) return;
      // スロット自体が傾いている場合は、画面上のドラッグ方向をスロット座標に合わせる
      const a = (-(slot.angle || 0) * Math.PI) / 180;
      const ldx = dx * Math.cos(a) - dy * Math.sin(a);
      const ldy = dx * Math.sin(a) + dy * Math.cos(a);
      let newOffX = dragState.startOffsetX + ldx * s4k;
      let newOffY = dragState.startOffsetY + ldy * s4k;

      const dim = getSlotDrawSize(slot);
      if (dim) {
        [newOffX, newOffY] = snapOffsetXY(newOffX, newOffY, dim.drawW, dim.drawH, dim.sw, dim.sh);
      }

      slot.offsetX = newOffX;
      slot.offsetY = newOffY;
      renderPreview();
    }
  } else if (dragState.type === 'swap') {
    const t = slotIndexAtClient(e.clientX, e.clientY);
    if (t !== state.swapTarget) {
      state.swapTarget = t;
      renderPreview();
    }
  } else if (dragState.type === 'rotate') {
    const dx = e.clientX - dragState.startClientX;
    if (!dragState.moved && Math.abs(dx) > 3) {
      dragState.moved = true;
    }
    if (dragState.moved) {
      let newRot = dragState.startRotation + dx * 0.5;
      newRot = snapRotation(newRot);
      state.slots[dragState.slotIndex].rotation = newRot;
      renderPreview();
    }
  } else if (dragState.type === 'delete') {
    const dx = e.clientX - dragState.startClientX;
    const dy = e.clientY - dragState.startClientY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragState.moved = true;
    }
  }
}

window.addEventListener('pointermove', handlePointerMove);

canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !dragState && state.hoveredSlot !== -1) {
    state.hoveredSlot = -1;
    renderPreview();
  }
});

function handlePointerUp(e, cancelled = false) {
  pointers.delete(e.pointerId);
  clearLongPress();

  if (pinchState) {
    // 2本指 → 指が全部離れるまでピンチ扱い
    if (pointers.size === 0) pinchState = null;
    return;
  }
  if (!dragState) return;

  if (cancelled) {
    // 何も確定させない
  } else if (dragState.type === 'delete' && !dragState.moved) {
    const slot = state.slots[dragState.slotIndex];
    if (slot.photo) {
      const pi = state.photos.indexOf(slot.photo);
      if (pi >= 0) state.photos.splice(pi, 1);
    }
    slot.photo = null;
    slot.offsetX = 0;
    slot.offsetY = 0;
    slot.scale = 1;
    slot.rotation = 0;
    if (state.dynamic) relayout();
    updateAllUI();
  } else if (dragState.type === 'swap') {
    const from = state.swapSource;
    const to = state.swapTarget;
    if (from >= 0 && to >= 0 && from !== to) {
      swapSlots(from, to);
      state.hoveredSlot = to;
      showToast(`${from + 1} ⇄ ${to + 1} を入れ替えました`, 1500);
    }
  } else if (dragState.type === 'pan' && !dragState.moved) {
    const slot = state.slots[dragState.slotIndex];
    // タッチで写真ありの未選択スロット → まず選択だけ
    if (!(dragState.isTouch && slot.photo && !dragState.wasSelected)) {
      replaceSlotIndex = dragState.slotIndex;
      fileInput.click();
    }
  }

  resetSwapUI();
  dragState = null;
  renderPreview();
}

window.addEventListener('pointerup', (e) => handlePointerUp(e));
window.addEventListener('pointercancel', (e) => handlePointerUp(e, true));

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const [x, y] = mouseToCanvas4K(e);
    const idx = hitTestSlot(state.slots, state, x, y);
    if (idx < 0) return;

    const slot = state.slots[idx];
    if (!slot.photo) return;

    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const cur = slot.scale || 1;
    const target = cur + delta;

    if ((cur < 1.0 && target >= 1.0) || (cur > 1.0 && target <= 1.0)) {
      slot.scale = 1.0;
    } else {
      slot.scale = Math.max(0.5, Math.min(3, target));
    }
    renderPreview();
  },
  { passive: false }
);

// ==================== Drag & Drop ====================

previewContainer.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  previewContainer.classList.add('drag-over');
});

previewContainer.addEventListener('dragleave', (e) => {
  if (!previewContainer.contains(e.relatedTarget)) previewContainer.classList.remove('drag-over');
});

previewContainer.addEventListener('drop', (e) => {
  e.preventDefault();
  previewContainer.classList.remove('drag-over');
  replaceSlotIndex = -1;
  handleFiles(Array.from(e.dataTransfer.files));
});

// ==================== UI ====================

let toastTimer = null;

function showToast(msg, duration = 3000) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
}

function updateAllUI() {
  updateTemplateButtons();
  updateGridInputs();
  updatePhotoInfo();
  updateLabelsUI();
  updatePanelVisibility();
  updateLabelBgUI();
  updateFooter();
}

function updateTemplateButtons() {
  const current = state.gridMode === 'custom' ? '__custom' : state.template;
  for (const [key, { btn }] of railItems) {
    const on = key === current;
    const was = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', String(on));
    // 横スクロールの一覧（スマホ）では、選んだレイアウトが見える位置へ
    if (on && !was && window.matchMedia('(max-width: 1100px)').matches) {
      const rail = $('rail');
      const r = btn.getBoundingClientRect();
      const rr = rail.getBoundingClientRect();
      if (r.left < rr.left || r.right > rr.right) {
        rail.scrollTo({ left: rail.scrollLeft + r.left - rr.left - 16, behavior: 'smooth' });
      }
    }
  }
  const name = state.gridMode === 'custom'
    ? `${state.rows}×${state.cols} グリッド`
    : LAYOUTS[state.template]?.name || '';
  const count = state.photos.length;
  $('header-status').innerHTML = `<b>${name}</b>　${count > 0 ? `${count}枚の写真` : '写真はまだありません'}`;
  $('empty-state').hidden = count > 0;
  scheduleThumbs();
}

function updateGridInputs() {
  $('grid-rows').value = state.rows || 1;
  $('grid-cols').value = state.cols || 1;
}

function updatePhotoInfo() {
  const count = state.photos.length;
  const max = state.gridMode === 'preset' ? getLayoutMax(state.template) : null;
  let text = count > 0 ? `${count}枚の写真を読み込み済み` : '';
  if (count > 0 && max && count > max) text += `（表示 ${max}枚まで）`;
  $('photo-count').textContent = text;

  const info = $('monthly-info');
  if (state.template === 'monthly' && state.photos.length > 0) {
    const first4 = state.photos.slice(0, 4);
    const vCount = first4.filter((p) => p.naturalHeight > p.naturalWidth).length;
    const hCount = first4.length - vCount;
    const lines = first4.map((p, i) => {
      const o = p.naturalHeight > p.naturalWidth ? '縦' : '横';
      return `${i + 1}: ${p.naturalWidth}×${p.naturalHeight} (${o})`;
    });
    const patternName = state.monthlyPattern ? getMonthlyPatternName(state.monthlyPattern) : '';
    info.innerHTML =
      lines.join('<br>') +
      `<br><b>→ 縦${vCount}枚+横${hCount}枚 ${patternName}</b>`;
  } else if (state.template === 'calendar' && state.gridMode === 'preset' && count > 0) {
    const shown = state.slots.filter((s) => s.photo).length;
    let t = `${state.calendarMonth}月: ${shown}日分を配置`;
    if (state.calendarOutside) t += ` / 他の月 ${state.calendarOutside}枚`;
    if (state.calendarDup) t += ` / 同日の重複 ${state.calendarDup}枚`;
    info.textContent = t;
  } else {
    info.innerHTML = '';
  }
}

function updateLabelsUI() {
  const body = $('labels-body');
  body.innerHTML = '';

  const show = state.labelsEditable;
  $('labels-panel').hidden = !show;
  if (!show) return;

  state.slots.forEach((slot, i) => {
    const row = document.createElement('div');
    row.className = 'label-row';

    const num = document.createElement('span');
    num.className = 'label-num';
    num.textContent = `${i + 1}.`;

    const input = document.createElement('input');
    input.className = 'label-input';
    input.value = slot.label || '';
    input.placeholder = state.captionLabels ? `キャプション ${i + 1}` : `スロット ${i + 1}`;
    input.addEventListener('input', () => {
      slot.label = input.value;
      if (state.captionLabels && slot.photo) slot.photo.caption = input.value;
      renderPreview();
    });

    row.appendChild(num);
    row.appendChild(input);
    body.appendChild(row);
  });
}

function updatePanelVisibility() {
  $('font-panel').hidden = !state.hasLabels;
  $('overlay-panel').hidden = state.template !== 'yearly' || state.gridMode !== 'preset';
  $('text-empty').hidden = state.hasLabels || state.labelsEditable || !$('overlay-panel').hidden;

  // レイアウト設定: 現在のテンプレートに対応する行だけ表示
  const t = state.gridMode === 'preset' ? state.template : '';
  let any = false;
  document.querySelectorAll('#layout-options-body [data-for]').forEach((el) => {
    const on = el.dataset.for.split(' ').includes(t);
    el.hidden = !on;
    any = any || on;
  });
  $('layout-options-panel').hidden = !any;
  $('layout-options-title').textContent = `レイアウト設定（${LAYOUTS[t]?.name || ''}）`;
  syncLayoutOptions();
}

function syncLayoutOptions() {
  $('opt-hero-pos').value = state.heroPos;
  $('opt-diagonal-slant').value = state.diagonalSlant;
  $('opt-diagonal-slant-val').textContent = state.diagonalSlant + 'px';
  $('opt-polaroid-tilt').value = state.polaroidTilt;
  $('opt-polaroid-tilt-val').textContent = state.polaroidTilt + '°';
  $('opt-cal-month').value = `${state.calendarYear}-${String(state.calendarMonth).padStart(2, '0')}`;
  $('opt-cal-weekstart').value = String(state.calendarWeekStart);
  const t = state.template;
  if (document.activeElement !== $('opt-design-title')) {
    $('opt-design-title').value = state.designTitles[t] ?? defaultDesignTitle(t, state.photos);
  }
  if (state.paperColors[t]) $('opt-paper-color').value = state.paperColors[t];
  $('opt-bg-blur').value = state.bgBlur;
  $('opt-bg-blur-val').textContent = state.bgBlur + 'px';
  $('opt-bg-dim').value = state.bgDim;
  $('opt-bg-dim-val').textContent = state.bgDim + '%';
}

function updateLabelBgUI() {
  $('input-label-bg-opacity').value = Math.round(state.labelBgOpacity * 100);
  $('label-bg-opacity-val').textContent = Math.round(state.labelBgOpacity * 100) + '%';
  $('input-label-bg-sync').checked = state.labelBgSyncColor;
  $('input-label-bg-color').value = state.labelBgColor;
  $('label-bg-color-row').classList.toggle('disabled', state.labelBgSyncColor);
}

function updateFooter() {
  $('input-filename').value = state.filename;
  $('input-format').value = state.format;
  $('input-quality').value = state.jpegQuality;
  $('quality-val').textContent = state.jpegQuality + '%';
  $('quality-group').hidden = state.format !== 'jpeg';
  const isJpeg = state.format === 'jpeg';
  document.querySelectorAll('.seg').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.format === state.format)));
  $('filename-ext').textContent = isJpeg ? '.jpg' : '.png';
  $('export-sub').textContent = `3840 × 2160 ${isJpeg ? `JPEG ${state.jpegQuality}%` : 'PNG'}`;
}

// ==================== Event listeners ====================

function setupEvents() {
  setupTabs();
  $('btn-empty-add').addEventListener('click', () => {
    replaceSlotIndex = -1;
    fileInput.click();
  });
  document.querySelectorAll('.seg').forEach((b) => {
    b.addEventListener('click', () => {
      const sel = $('input-format');
      sel.value = b.dataset.format;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // Layout options
  $('opt-hero-pos').addEventListener('change', (e) => {
    state.heroPos = e.target.value;
    relayout();
  });
  $('opt-diagonal-slant').addEventListener('input', (e) => {
    state.diagonalSlant = parseInt(e.target.value);
    relayout();
  });
  $('opt-polaroid-tilt').addEventListener('input', (e) => {
    state.polaroidTilt = parseInt(e.target.value);
    relayout();
  });
  $('opt-cal-month').addEventListener('change', (e) => {
    const [y, m] = (e.target.value || '').split('-').map(Number);
    if (!y || !m) return;
    state.calendarYear = y;
    state.calendarMonth = m;
    relayout();
  });
  $('opt-cal-weekstart').addEventListener('change', (e) => {
    state.calendarWeekStart = parseInt(e.target.value);
    relayout();
  });
  $('opt-design-title').addEventListener('input', (e) => {
    state.designTitles[state.template] = e.target.value;
    relayout();
  });
  $('opt-paper-color').addEventListener('input', (e) => {
    state.paperColors[state.template] = e.target.value;
    relayout();
  });
  $('opt-bg-blur').addEventListener('input', (e) => {
    state.bgBlur = parseInt(e.target.value);
    relayout();
  });
  $('opt-bg-dim').addEventListener('input', (e) => {
    state.bgDim = parseInt(e.target.value);
    relayout();
  });
  $('btn-sort-time').addEventListener('click', sortPhotosByTime);
  $('btn-layout-variant').addEventListener('click', () => {
    state.layoutVariant++;
    relayout();
  });

  // Grid controls
  $('grid-rows').addEventListener('change', (e) => {
    const rows = Math.max(1, Math.min(3, parseInt(e.target.value) || 1));
    const cols = Math.max(1, Math.min(6, parseInt($('grid-cols').value) || 1));
    setCustomGrid(rows, cols);
  });
  $('grid-cols').addEventListener('change', (e) => {
    const rows = Math.max(1, Math.min(3, parseInt($('grid-rows').value) || 1));
    const cols = Math.max(1, Math.min(6, parseInt(e.target.value) || 1));
    setCustomGrid(rows, cols);
  });

  // Add photos
  $('btn-add-photos').addEventListener('click', () => {
    replaceSlotIndex = -1;
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    handleFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });

  // Gap
  $('input-gap').addEventListener('input', (e) => {
    state.gap = parseInt(e.target.value);
    $('gap-val').textContent = state.gap + 'px';
    renderPreview();
  });

  // Background color
  $('input-bg-color').addEventListener('input', (e) => {
    state.bgColor = e.target.value;
    renderPreview();
  });

  // Font size
  $('input-font-size').addEventListener('input', (e) => {
    state.fontSize = parseInt(e.target.value);
    $('font-size-val').textContent = state.fontSize + 'px';
    renderPreview();
  });

  // Font color
  $('input-font-color').addEventListener('input', (e) => {
    state.fontColor = e.target.value;
    if (state.labelBgSyncColor) {
      state.labelBgColor = state.fontColor;
      $('input-label-bg-color').value = state.fontColor;
    }
    renderPreview();
  });

  // Font bold
  $('input-font-bold').addEventListener('change', (e) => {
    state.fontBold = e.target.checked;
    renderPreview();
  });

  // Label background opacity
  $('input-label-bg-opacity').addEventListener('input', (e) => {
    state.labelBgOpacity = parseInt(e.target.value) / 100;
    $('label-bg-opacity-val').textContent = Math.round(state.labelBgOpacity * 100) + '%';
    renderPreview();
  });

  // Label bg sync
  $('input-label-bg-sync').addEventListener('change', (e) => {
    state.labelBgSyncColor = e.target.checked;
    if (state.labelBgSyncColor) {
      state.labelBgColor = state.fontColor;
      $('input-label-bg-color').value = state.fontColor;
    }
    $('label-bg-color-row').classList.toggle('disabled', state.labelBgSyncColor);
    renderPreview();
  });

  // Label bg color
  $('input-label-bg-color').addEventListener('input', (e) => {
    state.labelBgColor = e.target.value;
    renderPreview();
  });

  // Overlay controls
  $('input-overlay-enabled').addEventListener('change', (e) => {
    state.overlayEnabled = e.target.checked;
    renderPreview();
  });
  $('input-overlay-text').addEventListener('input', (e) => {
    state.overlayText = e.target.value;
    renderPreview();
  });
  $('input-overlay-size').addEventListener('input', (e) => {
    state.overlayFontSize = parseInt(e.target.value);
    $('overlay-size-val').textContent = state.overlayFontSize + 'px';
    renderPreview();
  });
  $('input-overlay-pos').addEventListener('change', (e) => {
    state.overlayPosition = e.target.value;
    renderPreview();
  });
  $('input-overlay-color').addEventListener('input', (e) => {
    state.overlayColor = e.target.value;
    renderPreview();
  });

  // Format
  $('input-format').addEventListener('change', (e) => {
    queueMicrotask(updateFooter);
    state.format = e.target.value;
    $('quality-group').hidden = state.format !== 'jpeg';
    state.filename = state.filename.replace(/\.(png|jpg|jpeg)$/i, '');
    $('input-filename').value = state.filename;
  });

  // JPEG quality
  $('input-quality').addEventListener('input', (e) => {
    state.jpegQuality = parseInt(e.target.value);
    $('export-sub').textContent = `3840 × 2160 JPEG ${state.jpegQuality}%`;
    $('quality-val').textContent = state.jpegQuality + '%';
  });

  // Filename
  $('input-filename').addEventListener('input', (e) => {
    state.filename = e.target.value;
  });

  // Download
  $('btn-download').addEventListener('click', downloadImage);

  // Window resize
  window.addEventListener('resize', resizeCanvas);
}

// ==================== Layout rail（今の写真で描くレイアウト一覧） ====================

const RAIL_GROUPS = [
  ['preset', '定番'],
  ['auto', '自動で並べる'],
  ['compose', '構図'],
  ['style', '装飾'],
  ['design', 'デザイン'],
];
const railItems = new Map(); // template -> { btn, cv }

function buildRail() {
  const root = $('rail-groups');
  for (const [group, title] of RAIL_GROUPS) {
    const sec = document.createElement('section');
    sec.className = 'rail-group';
    const h = document.createElement('h2');
    h.className = 'rail-title';
    h.textContent = title;
    const grid = document.createElement('div');
    grid.className = 'rail-grid';
    for (const [key, def] of Object.entries(LAYOUTS)) {
      if (def.group !== group) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rail-item';
      btn.dataset.template = key;
      btn.setAttribute('aria-pressed', 'false');
      const cv = document.createElement('canvas');
      cv.className = 'rail-thumb';
      cv.width = 320;
      cv.height = 180;
      cv.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'rail-name';
      name.textContent = def.name;
      btn.append(cv, name);
      btn.addEventListener('click', () => setTemplate(key));
      grid.append(btn);
      railItems.set(key, { btn, cv });
    }
    sec.append(h, grid);
    root.append(sec);
  }
  const customBtn = document.querySelector('[data-template="__custom"]');
  customBtn.addEventListener('click', () => {
    const rows = Math.max(1, Math.min(3, parseInt($('grid-rows').value) || 1));
    const cols = Math.max(1, Math.min(6, parseInt($('grid-cols').value) || 1));
    setCustomGrid(rows, cols);
  });
  railItems.set('__custom', { btn: customBtn, cv: customBtn.querySelector('canvas') });
}

let thumbTimer = null;
function scheduleThumbs() {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(renderThumbs, 140);
}

const withThumb = (p) => (p && p.thumb ? { ...p, img: p.thumb } : p);

function thumbStateFor(key) {
  const isCurrent =
    (key === '__custom' && state.gridMode === 'custom') ||
    (key === state.template && state.gridMode === 'preset');
  let slots;
  let decor;
  if (isCurrent) {
    // 今のレイアウトは調整中の状態をそのまま映す
    slots = state.slots.map((s) => ({ ...s }));
    decor = state.decor;
  } else {
    const config = key === '__custom'
      ? getCustomGridConfig(state.rows, state.cols)
      : getTemplateConfig(key, state.photos, { ...state, layoutVariant: 0 });
    slots = config.slots.map(newSlot);
    if (key === 'monthly') assignMonthlyPhotos(slots);
    else if (key === 'calendar') assignCalendarPhotos(slots, false);
    else assignPhotosInOrder(slots);
    if (config.captionLabels) slots.forEach((s) => (s.label = s.photo?.caption || ''));
    fillSubLabels(slots);
    decor = config.decor || null;
  }
  slots.forEach((s) => (s.photo = withThumb(s.photo)));
  return {
    ...state,
    template: key === '__custom' ? 'custom' : key,
    gridMode: key === '__custom' ? 'custom' : 'preset',
    slots,
    decor,
    hoveredSlot: -1,
    swapSource: -1,
    swapTarget: -1,
  };
}

function renderThumbs() {
  for (const [key, { cv }] of railItems) {
    render(cv, thumbStateFor(key), { isExport: true });
  }
  renderPhotoStrip();
}

function renderPhotoStrip() {
  const strip = $('photo-strip');
  strip.innerHTML = '';
  const MAX = 15;
  state.photos.slice(0, MAX).forEach((p, i) => {
    const c = document.createElement('canvas');
    c.width = 104;
    c.height = 104;
    c.title = p.name || `写真 ${i + 1}`;
    const ctx = c.getContext('2d');
    const src = p.thumb || p.img;
    const sw = src.width || src.naturalWidth;
    const sh = src.height || src.naturalHeight;
    const s = Math.min(sw, sh);
    ctx.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, 104, 104);
    strip.append(c);
  });
  if (state.photos.length > MAX) {
    const more = document.createElement('span');
    more.className = 'more';
    more.textContent = `+${state.photos.length - MAX}`;
    strip.append(more);
  }
}

// ==================== Tabs ====================

function setupTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  const select = (tab, focus = false) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    moveInk(tab);
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        select(next, true);
      }
    });
  });
  window.addEventListener('resize', () => moveInk(document.querySelector('.tab[aria-selected="true"]')));
  requestAnimationFrame(() => moveInk(tabs[0]));
}

function moveInk(tab) {
  if (!tab) return;
  const ink = document.querySelector('.tab-ink');
  const w = Math.min(56, tab.offsetWidth * 0.5);
  ink.style.width = `${w}px`;
  ink.style.transform = `translateX(${tab.offsetLeft + (tab.offsetWidth - w) / 2}px)`;
}

// ==================== Download ====================

function downloadImage() {
  const exportCanvas = renderForExport(state);
  const ext = state.format === 'jpeg' ? 'jpg' : 'png';
  const mimeType = state.format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = state.format === 'jpeg' ? state.jpegQuality / 100 : undefined;

  exportCanvas.toBlob(
    (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.filename}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    mimeType,
    quality
  );
}

// ==================== Settings persistence ====================

const SETTINGS_KEY = 'vrcPhotoLayout.settings.v1';
const PERSIST_KEYS = [
  'gap', 'bgColor',
  'fontSize', 'fontColor', 'fontBold',
  'labelBgOpacity', 'labelBgSyncColor', 'labelBgColor',
  'overlayEnabled', 'overlayText', 'overlayPosition', 'overlayColor', 'overlayFontSize',
  'format', 'jpegQuality',
  'heroPos', 'diagonalSlant', 'polaroidTilt', 'calendarWeekStart',
  'bgBlur', 'bgDim',
];
const DEFAULT_SETTINGS = Object.fromEntries(PERSIST_KEYS.map((k) => [k, state[k]]));

function applySettings(data) {
  for (const k of PERSIST_KEYS) {
    if (data && k in data && typeof data[k] === typeof DEFAULT_SETTINGS[k]) {
      state[k] = data[k];
    }
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) applySettings(JSON.parse(raw));
  } catch {
    // 保存領域が使えない環境では既定値のまま
  }
}

function saveSettings() {
  try {
    const data = Object.fromEntries(PERSIST_KEYS.map((k) => [k, state[k]]));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function resetSettings() {
  applySettings(DEFAULT_SETTINGS);
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // ignore
  }
  syncControls();
  if (state.gridMode === 'preset') relayout();
  updateAllUI();
  renderPreview();
  showToast('スタイル設定を初期値に戻しました');
}

/** state の値を各入力コントロールに反映 */
function syncControls() {
  $('input-gap').value = state.gap;
  $('gap-val').textContent = state.gap + 'px';
  $('input-bg-color').value = state.bgColor;
  $('input-font-size').value = state.fontSize;
  $('font-size-val').textContent = state.fontSize + 'px';
  $('input-font-color').value = state.fontColor;
  $('input-font-bold').checked = state.fontBold;
  $('input-overlay-enabled').checked = state.overlayEnabled;
  $('input-overlay-text').value = state.overlayText;
  $('input-overlay-size').value = state.overlayFontSize;
  $('overlay-size-val').textContent = state.overlayFontSize + 'px';
  $('input-overlay-pos').value = state.overlayPosition;
  $('input-overlay-color').value = state.overlayColor;
  // ラベル背景・出力形式は updateAllUI() 内で反映
}

// ==================== Init ====================

function init() {
  loadSettings();
  syncControls();
  buildRail();
  setupEvents();
  // 個別のハンドラで state 更新後に保存（バブリングで後から呼ばれる）
  for (const id of ['inspector']) {
    $(id).addEventListener('input', saveSettings);
    $(id).addEventListener('change', saveSettings);
    $(id).addEventListener('input', scheduleThumbs);
  }
  $('btn-reset-settings').addEventListener('click', resetSettings);
  setTemplate('weekly');
  resizeCanvas();
  document.fonts.ready.then(() => {
    renderPreview();
    renderThumbs();
  });
  new ResizeObserver(() => resizeCanvas()).observe(previewContainer);
}

init();
