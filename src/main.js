import './style.css';
import {
  getTemplateConfig,
  getCustomGridConfig,
  detectMonthlyPattern,
  getMonthlyPatternName,
} from './templates.js';
import {
  render,
  renderForExport,
  hitTestSlot,
  hitTestDeleteButton,
  getContentRect,
  transformSlot,
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
  overlayText: '#VRC12Photos 2025',
  overlayPosition: 'top-left',
  overlayColor: '#ffffff',
  overlayFontSize: 72,
  format: 'png',
  jpegQuality: 90,
  filename: `weekly_${formatDate()}`,
  monthlyPattern: null,
  hoveredSlot: -1,
};

// ==================== DOM ====================

const $ = (id) => document.getElementById(id);
const canvas = $('preview-canvas');
const previewContainer = $('preview-container');
const fileInput = $('file-input');

// ==================== Canvas sizing ====================

function resizeCanvas() {
  const rect = previewContainer.getBoundingClientRect();
  const maxW = rect.width - 32;
  const maxH = rect.height - 32;

  let w = maxW;
  let h = w * (9 / 16);
  if (h > maxH) {
    h = maxH;
    w = h * (16 / 9);
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  renderPreview();
}

// ==================== Rendering ====================

function renderPreview() {
  render(canvas, state);
}

// ==================== Template management ====================

function setTemplate(name) {
  state.template = name;
  state.gridMode = 'preset';

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

  const config = getTemplateConfig(name, state.photos);
  state.slots = config.slots.map((s) => ({
    ...s,
    photo: null,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    rotation: 0,
  }));

  if (config.rows != null) state.rows = config.rows;
  if (config.cols != null) state.cols = config.cols;

  if (name === 'monthly') {
    state.monthlyPattern = config.pattern || null;
    assignMonthlyPhotos();
  } else {
    state.monthlyPattern = null;
    assignPhotosInOrder();
  }

  for (const slot of state.slots) {
    if (slot.photo && savedAdj.has(slot.photo)) {
      const a = savedAdj.get(slot.photo);
      slot.offsetX = a.offsetX;
      slot.offsetY = a.offsetY;
      slot.scale = a.scale;
      slot.rotation = a.rotation;
    }
  }

  state.filename = `${name}_${formatDate()}`;
  updateAllUI();
  renderPreview();
}

function setCustomGrid(rows, cols) {
  state.gridMode = 'custom';
  state.rows = rows;
  state.cols = cols;

  const config = getCustomGridConfig(rows, cols);
  state.slots = config.slots.map((s) => ({
    ...s,
    photo: null,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    rotation: 0,
  }));
  state.monthlyPattern = null;

  assignPhotosInOrder();
  updateAllUI();
  renderPreview();
}

function assignPhotosInOrder() {
  for (let i = 0; i < state.slots.length; i++) {
    state.slots[i].photo = state.photos[i] || null;
    state.slots[i].offsetX = 0;
    state.slots[i].offsetY = 0;
    state.slots[i].scale = 1;
    state.slots[i].rotation = 0;
  }
}

function assignMonthlyPhotos() {
  const photos = state.photos.slice(0, state.slots.length);
  if (photos.length === 0) return;

  const vPhotos = photos.filter((p) => p.naturalHeight > p.naturalWidth);
  const hPhotos = photos.filter((p) => p.naturalWidth >= p.naturalHeight);

  const vSlotIndices = [];
  const hSlotIndices = [];
  state.slots.forEach((s, i) => {
    if (s.slotType === 'portrait') vSlotIndices.push(i);
    else hSlotIndices.push(i);
  });

  let vi = 0;
  let hi = 0;
  for (const idx of vSlotIndices) {
    const photo = vPhotos[vi++] || hPhotos[hi++] || null;
    Object.assign(state.slots[idx], { photo, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
  }
  for (const idx of hSlotIndices) {
    const photo = hPhotos[hi++] || vPhotos[vi++] || null;
    Object.assign(state.slots[idx], { photo, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 });
  }
}

// ==================== Photo loading ====================

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({ img, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load: ${file.name}`));
    img.src = url;
  });
}

let replaceSlotIndex = -1;

async function handleFiles(files) {
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));
  if (imageFiles.length === 0) return;

  const loaded = await Promise.all(imageFiles.map(loadImage));

  if (replaceSlotIndex >= 0) {
    const slot = state.slots[replaceSlotIndex];
    const oldPhoto = slot.photo;
    slot.photo = loaded[0];
    slot.offsetX = 0;
    slot.offsetY = 0;
    slot.scale = 1;
    slot.rotation = 0;
    if (oldPhoto) {
      const pi = state.photos.indexOf(oldPhoto);
      if (pi >= 0) state.photos[pi] = loaded[0];
      else state.photos.push(loaded[0]);
    } else {
      state.photos.push(loaded[0]);
    }
    if (state.template === 'monthly') {
      setTemplate('monthly');
    }
    replaceSlotIndex = -1;
  } else {
    state.photos.push(...loaded);
    autoSuggestTemplate(loaded.length);
  }

  renderPreview();
  updateAllUI();
}

function autoSuggestTemplate(addedCount) {
  const total = state.photos.length;

  if (total === 5 && addedCount === 5) {
    setTemplate('weekly');
    showToast('5枚の写真を検出 → Weeklyテンプレートを適用');
  } else if (total === 4 && addedCount === 4 && state.template !== 'monthly') {
    setTemplate('monthly');
    const pn = getMonthlyPatternName(state.monthlyPattern);
    showToast(`4枚の写真を検出 → Monthly（${pn}）を適用`);
  } else if (total === 12 && addedCount === 12) {
    setTemplate('yearly');
    showToast('12枚の写真を検出 → Yearlyテンプレートを適用');
  } else if (state.template === 'monthly') {
    setTemplate('monthly');
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
      slot.photo = unassigned[ui++];
      slot.offsetX = 0;
      slot.offsetY = 0;
      slot.scale = 1;
      slot.rotation = 0;
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
  const cr = getContentRect(state);
  const ts = transformSlot(slot, cr);
  const gap = state.gap;
  const sw = Math.max(1, ts.w - gap);
  const sh = Math.max(1, ts.h - gap);

  const img = slot.photo;
  const rad = (slot.rotation || 0) * Math.PI / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  const reqW = sw * cosA + sh * sinA;
  const reqH = sw * sinA + sh * cosA;
  const base = Math.max(reqW / img.naturalWidth, reqH / img.naturalHeight);
  const final = base * (slot.scale || 1);
  return {
    sw, sh,
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

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const [x, y] = mouseToCanvas4K(e);

  state.hoveredSlot = hitTestSlot(state.slots, state, x, y);

  const deleteIdx = hitTestDeleteButton(state.slots, state, x, y);
  if (deleteIdx >= 0) {
    dragState = {
      type: 'delete',
      slotIndex: deleteIdx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
    return;
  }

  const idx = hitTestSlot(state.slots, state, x, y);
  if (idx < 0) return;

  if (e.altKey && state.slots[idx].photo) {
    dragState = {
      type: 'rotate',
      slotIndex: idx,
      startClientX: e.clientX,
      startRotation: state.slots[idx].rotation || 0,
      moved: false,
    };
  } else {
    dragState = {
      type: 'pan',
      slotIndex: idx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: state.slots[idx].offsetX || 0,
      startOffsetY: state.slots[idx].offsetY || 0,
      moved: false,
    };
  }
});

function handleMouseMove(e) {
  // Hover tracking
  const rect = canvas.getBoundingClientRect();
  const onCanvas =
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom;

  if (onCanvas && !dragState) {
    const [x, y] = mouseToCanvas4K(e);
    const newHovered = hitTestSlot(state.slots, state, x, y);
    if (newHovered !== state.hoveredSlot) {
      state.hoveredSlot = newHovered;
      renderPreview();
    }
  } else if (!onCanvas && !dragState && state.hoveredSlot !== -1) {
    state.hoveredSlot = -1;
    renderPreview();
  }

  if (!dragState) return;

  if (dragState.type === 'pan') {
    const dx = e.clientX - dragState.startClientX;
    const dy = e.clientY - dragState.startClientY;
    if (!dragState.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      dragState.moved = true;
    }
    if (dragState.moved) {
      const s4k = 3840 / canvas.clientWidth;
      const slot = state.slots[dragState.slotIndex];
      let newOffX = dragState.startOffsetX + dx * s4k;
      let newOffY = dragState.startOffsetY + dy * s4k;

      const dim = getSlotDrawSize(slot);
      if (dim) {
        [newOffX, newOffY] = snapOffsetXY(newOffX, newOffY, dim.drawW, dim.drawH, dim.sw, dim.sh);
      }

      slot.offsetX = newOffX;
      slot.offsetY = newOffY;
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

window.addEventListener('mousemove', handleMouseMove);

canvas.addEventListener('mouseleave', () => {
  if (!dragState && state.hoveredSlot !== -1) {
    state.hoveredSlot = -1;
    renderPreview();
  }
});

window.addEventListener('mouseup', () => {
  if (!dragState) return;

  if (dragState.type === 'delete' && !dragState.moved) {
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
    if (state.template === 'monthly') {
      setTemplate('monthly');
    }
    renderPreview();
    updateAllUI();
  } else if (dragState.type === 'pan' && !dragState.moved) {
    replaceSlotIndex = dragState.slotIndex;
    fileInput.click();
  }

  dragState = null;
});

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
  canvas.classList.add('drag-over');
});

previewContainer.addEventListener('dragleave', () => {
  canvas.classList.remove('drag-over');
});

previewContainer.addEventListener('drop', (e) => {
  e.preventDefault();
  canvas.classList.remove('drag-over');
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
  document.querySelectorAll('.tmpl-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.template === state.template);
  });
}

function updateGridInputs() {
  $('grid-rows').value = state.rows || 1;
  $('grid-cols').value = state.cols || 1;
}

function updatePhotoInfo() {
  const count = state.photos.length;
  $('photo-count').textContent = count > 0 ? `${count}枚の写真を読み込み済み` : '';

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
  } else {
    info.innerHTML = '';
  }
}

function updateLabelsUI() {
  const body = $('labels-body');
  body.innerHTML = '';

  const show =
    state.template === 'weekly' ||
    state.template === 'yearly' ||
    state.gridMode === 'custom';

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
    input.placeholder = `スロット ${i + 1}`;
    input.addEventListener('input', () => {
      slot.label = input.value;
      renderPreview();
    });

    row.appendChild(num);
    row.appendChild(input);
    body.appendChild(row);
  });
}

function updatePanelVisibility() {
  const hasLabels =
    state.template === 'weekly' ||
    state.template === 'yearly' ||
    state.gridMode === 'custom';
  $('font-panel').hidden = !hasLabels;
  $('overlay-panel').hidden = state.template !== 'yearly';
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
}

// ==================== Event listeners ====================

function setupEvents() {
  // Template buttons
  document.querySelectorAll('.tmpl-btn').forEach((btn) => {
    btn.addEventListener('click', () => setTemplate(btn.dataset.template));
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
    state.format = e.target.value;
    $('quality-group').hidden = state.format !== 'jpeg';
    state.filename = state.filename.replace(/\.(png|jpg|jpeg)$/i, '');
    $('input-filename').value = state.filename;
  });

  // JPEG quality
  $('input-quality').addEventListener('input', (e) => {
    state.jpegQuality = parseInt(e.target.value);
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

// ==================== Init ====================

function init() {
  setupEvents();
  setTemplate('weekly');
  resizeCanvas();
  document.fonts.ready.then(() => renderPreview());
}

init();
