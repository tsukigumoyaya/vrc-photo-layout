const W = 3840;
const H = 2160;
const FONT = "'Nunito', sans-serif";

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function getContentRect(state) {
  if (state.template !== 'yearly' || !state.overlayEnabled || !state.overlayText) {
    return { x: 0, y: 0, w: W, h: H };
  }
  const overlayW = Math.round((state.overlayFontSize || 72) * 8);
  return { x: overlayW, y: 0, w: W - overlayW, h: H };
}

export function transformSlot(slot, cr) {
  return {
    x: cr.x + (slot.x / W) * cr.w,
    y: cr.y + (slot.y / H) * cr.h,
    w: (slot.w / W) * cr.w,
    h: (slot.h / H) * cr.h,
  };
}

export function render(canvas, state, opts = {}) {
  const isExport = opts.isExport || false;
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / W;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);

  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, W, H);

  const gap = state.gap;
  const cr = getContentRect(state);

  for (let i = 0; i < state.slots.length; i++) {
    const slot = state.slots[i];
    const ts = transformSlot(slot, cr);

    const sx = ts.x + gap / 2;
    const sy = ts.y + gap / 2;
    const sw = Math.max(1, ts.w - gap);
    const sh = Math.max(1, ts.h - gap);

    // --- Photo / placeholder (clipped) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();

    if (slot.photo) {
      const img = slot.photo.img;
      const rad = (slot.rotation || 0) * Math.PI / 180;
      const cosA = Math.abs(Math.cos(rad));
      const sinA = Math.abs(Math.sin(rad));

      const requiredW = sw * cosA + sh * sinA;
      const requiredH = sw * sinA + sh * cosA;
      const baseScale = Math.max(requiredW / img.naturalWidth, requiredH / img.naturalHeight);
      const finalScale = baseScale * (slot.scale || 1);
      const drawW = img.naturalWidth * finalScale;
      const drawH = img.naturalHeight * finalScale;

      const cx = sx + sw / 2 + (slot.offsetX || 0);
      const cy = sy + sh / 2 + (slot.offsetY || 0);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rad);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = '#555';
      ctx.font = `100px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', sx + sw / 2, sy + sh / 2);
    }

    ctx.restore(); // end clip

    // --- Label ---
    if (slot.label) {
      const fontSize = state.fontSize || 48;
      const fontWeight = state.fontBold ? 'bold' : 'normal';
      const isYearly = state.template === 'yearly';
      const pad = fontSize * 0.4;

      if (isYearly) {
        const labelX = sx + sw - pad;
        const labelY = sy + sh - pad;

        if ((state.labelBgOpacity || 0) > 0) {
          const bgColor = state.labelBgSyncColor
            ? (state.fontColor || '#ffffff')
            : (state.labelBgColor || '#ffffff');
          const bandH = fontSize * 2;
          ctx.fillStyle = hexToRgba(bgColor, state.labelBgOpacity);
          ctx.fillRect(sx, sy + sh - bandH, sw, bandH);
        }

        ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = state.fontColor || '#ffffff';
        ctx.fillText(slot.label, labelX, labelY);
      } else {
        const bandH = fontSize * 2;
        const labelX = sx + sw / 2;
        const labelY = sy + sh - bandH / 2;

        if ((state.labelBgOpacity || 0) > 0) {
          const bgColor = state.labelBgSyncColor
            ? (state.fontColor || '#ffffff')
            : (state.labelBgColor || '#ffffff');
          ctx.fillStyle = hexToRgba(bgColor, state.labelBgOpacity);
          ctx.fillRect(sx, sy + sh - bandH, sw, bandH);
        }

        ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = state.fontColor || '#ffffff';
        ctx.fillText(slot.label, labelX, labelY);
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // --- UI overlays (preview only) ---
    if (!isExport) {
      // Delete button (hover)
      if (slot.photo && i === state.hoveredSlot) {
        const btnR = 30;
        const btnMargin = 14;
        const btnCX = sx + sw - btnR - btnMargin;
        const btnCY = sy + btnR + btnMargin;

        ctx.fillStyle = 'rgba(220,38,38,0.75)';
        ctx.beginPath();
        ctx.arc(btnCX, btnCY, btnR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = `bold 30px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', btnCX, btnCY);
      }

      // Rotation badge
      if (slot.photo && slot.rotation && Math.abs(slot.rotation) > 0.1) {
        const text = `${Math.round(slot.rotation)}°`;
        ctx.font = `bold 24px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';

        const tw = ctx.measureText(text).width;
        const bx = sx + 12;
        const by = sy + sh - 12;

        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, bx - 6, by - 30, tw + 12, 34, 6);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.fillText(text, bx, by);
      }
    }
  }

  // --- Yearly overlay text (left band) ---
  if (state.template === 'yearly' && state.overlayEnabled && state.overlayText) {
    const oFontSize = state.overlayFontSize || 72;
    const overlayW = Math.round(oFontSize * 8);

    ctx.save();
    ctx.translate(overlayW / 2, H / 2);
    ctx.rotate(-Math.PI / 2);

    ctx.font = `bold ${oFontSize}px ${FONT}`;
    ctx.fillStyle = state.overlayColor || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(state.overlayText, 0, 0);

    ctx.restore();
  }

  ctx.restore();
}

export function renderForExport(state) {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = W;
  exportCanvas.height = H;
  render(exportCanvas, state, { isExport: true });
  return exportCanvas;
}

export function hitTestSlot(slots, state, x4k, y4k) {
  const cr = getContentRect(state);
  for (let i = slots.length - 1; i >= 0; i--) {
    const ts = transformSlot(slots[i], cr);
    if (x4k >= ts.x && x4k < ts.x + ts.w && y4k >= ts.y && y4k < ts.y + ts.h) {
      return i;
    }
  }
  return -1;
}

export function hitTestDeleteButton(slots, state, x4k, y4k) {
  const cr = getContentRect(state);
  const gap = state.gap;
  const btnR = 30;
  const btnMargin = 14;

  for (let i = slots.length - 1; i >= 0; i--) {
    if (!slots[i].photo) continue;
    const ts = transformSlot(slots[i], cr);
    const sx = ts.x + gap / 2;
    const sy = ts.y + gap / 2;
    const sw = Math.max(1, ts.w - gap);

    const cx = sx + sw - btnR - btnMargin;
    const cy = sy + btnR + btnMargin;

    const dx = x4k - cx;
    const dy = y4k - cy;
    if (dx * dx + dy * dy <= btnR * btnR) return i;
  }
  return -1;
}
