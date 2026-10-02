const W = 3840;
const H = 2160;
const FONT = "'Nunito', sans-serif";
const HAND_FONT = "'Yusei Magic', 'Nunito', sans-serif";

// ==================== Helpers ====================

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

function setShadow(ctx, blur = 10, color = 'rgba(0,0,0,0.8)', off = 2) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = off;
  ctx.shadowOffsetY = off;
}

function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ==================== Geometry ====================

function getOverlayBandWidth(state) {
  return Math.round((state.overlayFontSize || 72) * 8);
}

export function getContentRect(state) {
  if (state.template !== 'yearly' || !state.overlayEnabled || !state.overlayText) {
    return { x: 0, y: 0, w: W, h: H };
  }
  const overlayW = getOverlayBandWidth(state);
  const onRight = state.overlayPosition === 'top-right';
  return { x: onRight ? 0 : overlayW, y: 0, w: W - overlayW, h: H };
}

export function transformSlot(slot, cr) {
  return {
    x: cr.x + (slot.x / W) * cr.w,
    y: cr.y + (slot.y / H) * cr.h,
    w: (slot.w / W) * cr.w,
    h: (slot.h / H) * cr.h,
  };
}

function transformPoint([px, py], cr) {
  return [cr.x + (px / W) * cr.w, cr.y + (py / H) * cr.h];
}

/**
 * スロットの描画用ジオメトリ（4K座標）
 * shape: rect | circle | poly、angle: スロット自体の回転、frame: polaroid
 */
export function getSlotGeometry(slot, state) {
  const cr = getContentRect(state);
  const ts = transformSlot(slot, cr);
  const gap = state.gap || 0;
  const shape = slot.shape || 'rect';
  // 多角形は境界線で、ポラロイドは枠で隙間を表現するので gap を引かない
  const noGap = shape === 'poly' || !!slot.frame || slot.blur != null;
  const sx = noGap ? ts.x : ts.x + gap / 2;
  const sy = noGap ? ts.y : ts.y + gap / 2;
  const sw = Math.max(1, noGap ? ts.w : ts.w - gap);
  const sh = Math.max(1, noGap ? ts.h : ts.h - gap);
  const g = {
    shape,
    sx, sy, sw, sh,
    cx: sx + sw / 2,
    cy: sy + sh / 2,
    angle: ((slot.angle || 0) * Math.PI) / 180,
  };
  if (shape === 'circle') g.r = Math.max(1, Math.min(sw, sh) / 2);
  if (shape === 'poly') g.poly = slot.poly.map((p) => transformPoint(p, cr));
  if (slot.frame === 'polaroid') {
    const s = Math.min(sw, sh);
    g.frame = { pad: s * 0.06, bottom: s * 0.24 };
  } else if (slot.frame === 'card') {
    const pad = Math.min(sw, sh) * 0.045;
    g.frame = { pad, bottom: pad };
  }
  return g;
}

/** 写真を cover で敷き詰める基準の箱 */
export function getCoverBox(g) {
  if (g.shape === 'circle') return { w: g.r * 2, h: g.r * 2 };
  return { w: g.sw, h: g.sh };
}

/** スロットの回転を打ち消したローカル座標へ */
function toLocal(g, x, y) {
  if (!g.angle) return [x, y];
  const dx = x - g.cx;
  const dy = y - g.cy;
  const c = Math.cos(-g.angle);
  const s = Math.sin(-g.angle);
  return [g.cx + dx * c - dy * s, g.cy + dx * s + dy * c];
}

function hitGeometry(g, x, y) {
  const [lx, ly] = toLocal(g, x, y);
  if (g.shape === 'circle') return (lx - g.cx) ** 2 + (ly - g.cy) ** 2 <= g.r ** 2;
  if (g.shape === 'poly') return pointInPoly(lx, ly, g.poly);
  let { sx, sy, sw, sh } = g;
  if (g.frame) {
    sx -= g.frame.pad;
    sy -= g.frame.pad;
    sw += g.frame.pad * 2;
    sh += g.frame.pad + g.frame.bottom;
  }
  return lx >= sx && lx < sx + sw && ly >= sy && ly < sy + sh;
}

function shapePath(ctx, g) {
  ctx.beginPath();
  if (g.shape === 'circle') {
    ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
  } else if (g.shape === 'poly') {
    g.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  } else {
    ctx.rect(g.sx, g.sy, g.sw, g.sh);
  }
}

function withSlotTransform(ctx, g, fn) {
  ctx.save();
  if (g.angle) {
    ctx.translate(g.cx, g.cy);
    ctx.rotate(g.angle);
    ctx.translate(-g.cx, -g.cy);
  }
  fn();
  ctx.restore();
}

function deleteButtonCenter(g, btnR) {
  const m = btnR * 0.47;
  if (g.shape === 'circle') return [g.cx, g.cy - g.r + btnR + m * 2];
  if (g.shape === 'poly') {
    const minY = Math.min(...g.poly.map((p) => p[1]));
    const tops = g.poly.filter((p) => Math.abs(p[1] - minY) < 1);
    const x = tops.reduce((a, p) => a + p[0], 0) / tops.length;
    return [x, minY + btnR + m];
  }
  return [g.sx + g.sw - btnR - m, g.sy + btnR + m];
}

function labelAnchorX(g) {
  if (g.shape === 'poly') {
    const maxY = Math.max(...g.poly.map((p) => p[1]));
    const bottoms = g.poly.filter((p) => Math.abs(p[1] - maxY) < 1);
    return bottoms.reduce((a, p) => a + p[0], 0) / bottoms.length;
  }
  return g.cx;
}

// ==================== Drawing parts ====================

function drawPhoto(ctx, slot, g, scale = 1) {
  const img = slot.photo.img;
  const box = { ...getCoverBox(g) };
  const blur = slot.blur || 0;
  if (blur > 0) {
    // ぼかしで端が透けないよう少し大きめに描く
    box.w += blur * 4;
    box.h += blur * 4;
  }
  const rad = ((slot.rotation || 0) * Math.PI) / 180;
  const cosA = Math.abs(Math.cos(rad));
  const sinA = Math.abs(Math.sin(rad));
  const requiredW = box.w * cosA + box.h * sinA;
  const requiredH = box.w * sinA + box.h * cosA;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const baseScale = Math.max(requiredW / iw, requiredH / ih);
  const finalScale = baseScale * (slot.scale || 1);
  const drawW = iw * finalScale;
  const drawH = ih * finalScale;

  ctx.save();
  ctx.translate(g.cx + (slot.offsetX || 0), g.cy + (slot.offsetY || 0));
  ctx.rotate(rad);
  // filter のぼかし量は出力ピクセル基準なので、プレビュー縮小率を掛けてそろえる
  if (blur > 0) ctx.filter = `blur(${Math.max(0.5, blur * scale)}px)`;
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.filter = 'none';
  ctx.restore();

  if (slot.dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${slot.dim})`;
    ctx.fillRect(g.sx, g.sy, g.sw, g.sh);
  }
}

function drawTape(ctx, slot, g) {
  const t = slot.tape;
  const w = Math.min(g.sw * 0.38, 420);
  const h = Math.max(50, w * 0.24);
  ctx.save();
  ctx.translate(g.cx + t.offset * g.sw, g.sy - (g.frame ? g.frame.pad : 0));
  ctx.rotate((t.angle * Math.PI) / 180);
  ctx.fillStyle = 'rgba(255,222,130,0.72)';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.35);
  ctx.restore();
}

function drawPlaceholder(ctx, slot, g) {
  if (slot.placeholderStyle === 'subtle') {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(g.sx, g.sy, g.sw, g.sh);
    return;
  }
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(g.sx, g.sy, g.sw, g.sh);
  // 隣の空き枠と区別できるよう内側に薄い線
  shapePath(ctx, g);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = '#555';
  ctx.font = `100px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('+', g.cx, g.cy);
}

function drawCardFrame(ctx, g) {
  const { pad, bottom } = g.frame;
  ctx.save();
  setShadow(ctx, 40, 'rgba(0,0,0,0.45)', 10);
  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(g.sx - pad, g.sy - pad, g.sw + pad * 2, g.sh + pad + bottom);
  ctx.restore();
}

function labelBg(state) {
  return state.labelBgSyncColor ? state.fontColor || '#ffffff' : state.labelBgColor || '#ffffff';
}

function drawLabel(ctx, slot, g, state) {
  const fontSize = state.fontSize || 48;
  const fontWeight = state.fontBold ? 'bold' : 'normal';
  const pad = fontSize * 0.4;
  const style = slot.labelStyle || 'band';

  if (style === 'below') {
    const size = Math.max(fontSize * 1.1, 54);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = g.sy + g.sh + size * 0.55;
    if (slot.label) {
      ctx.font = `${fontWeight} ${size}px ${FONT}`;
      ctx.fillStyle = '#463c32';
      ctx.fillText(slot.label, g.sx, y, g.sw);
      y += size * 1.35;
    }
    if (slot.sublabel) {
      ctx.font = `${size * 0.7}px ${FONT}`;
      ctx.fillStyle = '#968c82';
      ctx.fillText(slot.sublabel, g.sx, y, g.sw);
    }
    return;
  }

  if (style === 'timeline-up' || style === 'timeline-down') {
    const up = style === 'timeline-up';
    const color = state.fontColor || '#ffffff';
    ctx.textAlign = 'center';
    setShadow(ctx, 8);
    if (slot.sublabel) {
      ctx.font = `bold ${fontSize * 1.1}px ${FONT}`;
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      // 時刻は線上の点の真上（真下）に。写真を端に寄せていてもずらさない
      const cr = getContentRect(state);
      const ax = slot.anchorX != null ? cr.x + (slot.anchorX / W) * cr.w : g.cx;
      ctx.fillText(slot.sublabel, ax, up ? g.sy + g.sh + 55 : g.sy - 55);
    }
    if (slot.label) {
      ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;
      ctx.fillStyle = color;
      ctx.textBaseline = up ? 'bottom' : 'top';
      ctx.fillText(slot.label, g.cx, up ? g.sy - 24 : g.sy + g.sh + 24, g.sw * 1.3);
    }
    clearShadow(ctx);
    return;
  }

  if (style === 'hand') {
    if (!slot.label) return;
    const size = fontSize * 1.15;
    ctx.font = `${size}px ${HAND_FONT}`;
    ctx.fillStyle = '#5a3c32';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(slot.label, g.cx, g.sy + g.sh + g.frame.bottom + size * 0.3, g.sw * 1.2);
    return;
  }

  if (style === 'polaroid') {
    const { bottom } = g.frame;
    const size = Math.min(fontSize * 1.3, bottom * 0.5);
    ctx.font = `${fontWeight} ${size}px ${FONT}`;
    ctx.fillStyle = '#3a3a3a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(slot.label, g.cx, g.sy + g.sh + bottom / 2, g.sw);
    return;
  }

  ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;

  if (style === 'corner-tl') {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    setShadow(ctx);
    ctx.fillStyle = state.fontColor || '#ffffff';
    ctx.fillText(slot.label, g.sx + pad, g.sy + pad * 0.7);
    clearShadow(ctx);
    return;
  }

  const bandH = fontSize * 2;
  if ((state.labelBgOpacity || 0) > 0) {
    ctx.save();
    shapePath(ctx, g);
    ctx.clip();
    ctx.fillStyle = hexToRgba(labelBg(state), state.labelBgOpacity);
    ctx.fillRect(g.sx, g.sy + g.sh - bandH, g.sw, bandH);
    ctx.restore();
  }

  setShadow(ctx);
  ctx.fillStyle = state.fontColor || '#ffffff';
  if (style === 'corner-br') {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(slot.label, g.sx + g.sw - pad, g.sy + g.sh - pad);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(slot.label, labelAnchorX(g), g.sy + g.sh - bandH / 2);
  }
  clearShadow(ctx);
}

function drawUiOverlays(ctx, slot, g, i, state) {
  // Delete button (hover / selected)
  if (slot.photo && i === state.hoveredSlot && state.swapSource < 0) {
    const btnR = state.deleteBtnR || 30;
    const [bx, by] = deleteButtonCenter(g, btnR);
    ctx.fillStyle = 'rgba(220,38,38,0.8)';
    ctx.beginPath();
    ctx.arc(bx, by, btnR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(btnR)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', bx, by);
  }

  // Rotation badge
  if (slot.photo && slot.rotation && Math.abs(slot.rotation) > 0.1) {
    const text = `${Math.round(slot.rotation)}°`;
    ctx.font = `bold 24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(text).width;
    const bx = g.sx + 12;
    const by = g.sy + g.sh - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, bx - 6, by - 30, tw + 12, 34, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(text, bx, by);
  }

  // Swap highlight
  if (state.swapSource >= 0) {
    if (i === state.swapSource) {
      ctx.save();
      shapePath(ctx, g);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();
      ctx.setLineDash([24, 16]);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();
    } else if (i === state.swapTarget) {
      ctx.save();
      shapePath(ctx, g);
      ctx.fillStyle = 'rgba(99,102,241,0.18)';
      ctx.fill();
      ctx.clip();
      shapePath(ctx, g);
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 28;
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ==================== Decorations ====================

function drawFilmDecor(ctx, decor) {
  for (const strip of decor.strips) {
    const { x, y, w, h, margin } = strip;
    ctx.fillStyle = '#1b1714';
    ctx.fillRect(x, y, w, h);

    // スプロケット穴
    const holeW = margin * 0.42;
    const holeH = margin * 0.5;
    const pitch = holeW * 2.1;
    const count = Math.floor(w / pitch);
    const startX = x + (w - count * pitch) / 2 + (pitch - holeW) / 2;
    ctx.fillStyle = '#d9d4c7';
    for (const rowY of [y + margin * 0.38 - holeH / 2, y + h - margin * 0.38 - holeH / 2]) {
      for (let k = 0; k < count; k++) {
        roundRect(ctx, startX + k * pitch, rowY, holeW, holeH, holeW * 0.18);
        ctx.fill();
      }
    }

    // エッジプリント（コマ番号）
    const fs = margin * 0.2;
    ctx.font = `bold ${fs}px ${FONT}`;
    ctx.fillStyle = '#e8a33d';
    ctx.textBaseline = 'middle';
    const textY = y + h - margin * 0.82;
    for (const f of strip.frames) {
      ctx.textAlign = 'left';
      ctx.fillText(`${f.n}`, f.x, textY);
      ctx.textAlign = 'center';
      ctx.fillText(`▶ ${f.n}A`, f.x + f.w / 2, textY);
    }
    ctx.textAlign = 'right';
    ctx.fillText('VRC 400', x + w - margin * 0.3, y + margin * 0.82);
  }
}

function drawCalendarDecor(ctx, decor, state) {
  const color = state.fontColor || '#ffffff';
  const { title, sub, titleRect, weekdays, blanks } = decor;

  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (const b of blanks) ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);

  const tSize = titleRect.h * 0.55;
  ctx.font = `bold ${tSize}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  setShadow(ctx);
  const tx = titleRect.x + tSize * 0.4;
  const ty = titleRect.y + titleRect.h / 2;
  ctx.fillText(title, tx, ty);
  const tw = ctx.measureText(title).width;
  ctx.font = `${tSize * 0.45}px ${FONT}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(sub, tx + tw + tSize * 0.4, ty + tSize * 0.08);
  ctx.globalAlpha = 1;

  for (const d of weekdays) {
    ctx.font = `bold ${d.h * 0.45}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = d.color || color;
    ctx.fillText(d.label, d.x + d.w / 2, d.y + d.h / 2);
  }
  clearShadow(ctx);
}

function drawStar(ctx, x, y, r, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (Math.PI / 5) * k;
    ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeart(ctx, x, y, r, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.4);
  ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.4, -r * 0.1, 0, r * 0.9);
  ctx.fill();
  ctx.restore();
}

function drawDesignTitle(ctx, t, state) {
  if (!t || !t.text) return;
  ctx.save();
  ctx.translate(t.x, t.y);
  if (t.angle) ctx.rotate((t.angle * Math.PI) / 180);
  const family = t.font === 'hand' ? HAND_FONT : FONT;
  ctx.font = `${t.font === 'hand' ? '' : 'bold '}${t.size}px ${family}`;
  ctx.textAlign = t.align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.color || state.fontColor || '#ffffff';
  if (!t.color) setShadow(ctx, 10);
  ctx.fillText(t.text, 0, 0);
  ctx.restore();
}

function drawDesignDecorBefore(ctx, decor, state) {
  if (decor.paper) {
    ctx.fillStyle = decor.paper;
    ctx.fillRect(0, 0, W, H);
  }
  if (decor.timeline) {
    const tl = decor.timeline;
    const color = state.fontColor || '#ffffff';
    ctx.strokeStyle = hexToRgba(color.length === 7 ? color : '#ffffff', 0.75);
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tl.x0, tl.y);
    ctx.lineTo(tl.x1, tl.y);
    ctx.stroke();
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 5;
    for (const p of tl.points) {
      ctx.beginPath();
      ctx.moveTo(p.x, tl.y);
      ctx.lineTo(p.x, p.from);
      ctx.stroke();
    }
    ctx.fillStyle = '#818cf8';
    for (const p of tl.points) {
      ctx.beginPath();
      ctx.arc(p.x, tl.y, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (!decor.titleAfter) drawDesignTitle(ctx, decor.title, state);
}

function drawDesignDecorAfter(ctx, decor, state) {
  for (const st of decor.stickers || []) {
    ctx.fillStyle = st.color;
    setShadow(ctx, 6, 'rgba(0,0,0,0.25)', 3);
    if (st.kind === 'heart') drawHeart(ctx, st.x, st.y, st.r, st.angle);
    else drawStar(ctx, st.x, st.y, st.r, st.angle);
    clearShadow(ctx);
  }
  if (decor.titleAfter) drawDesignTitle(ctx, decor.title, state);
}

// ==================== Main render ====================

export function render(canvas, state, opts = {}) {
  const isExport = opts.isExport || false;
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / W;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);

  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, W, H);

  const decor = state.decor;
  if (decor && decor.type === 'film') drawFilmDecor(ctx, decor);
  if (decor && decor.type === 'calendar') drawCalendarDecor(ctx, decor, state);
  if (decor && decor.type === 'design') drawDesignDecorBefore(ctx, decor, state);

  const geoms = state.slots.map((s) => getSlotGeometry(s, state));

  // Pass 1: 枠・写真（ポラロイドは重なり順を守るためキャプションもここで）
  state.slots.forEach((slot, i) => {
    const g = geoms[i];
    withSlotTransform(ctx, g, () => {
      if (g.frame) drawCardFrame(ctx, g);
      ctx.save();
      shapePath(ctx, g);
      ctx.clip();
      if (slot.photo) drawPhoto(ctx, slot, g, scale);
      else drawPlaceholder(ctx, slot, g);
      ctx.restore();
      if (slot.tape) drawTape(ctx, slot, g);
      if (g.frame && (slot.label || slot.sublabel)) drawLabel(ctx, slot, g, state);
    });
  });

  if (decor && decor.type === 'design') drawDesignDecorAfter(ctx, decor, state);

  // Pass 2: 多角形スロットの隙間（背景色の境界線）
  if (state.gap > 0) {
    ctx.strokeStyle = state.bgColor;
    ctx.lineWidth = state.gap;
    ctx.lineJoin = 'round';
    geoms.forEach((g) => {
      if (g.shape !== 'poly') return;
      shapePath(ctx, g);
      ctx.stroke();
    });
  }

  // Pass 3: ラベル・UI
  state.slots.forEach((slot, i) => {
    const g = geoms[i];
    withSlotTransform(ctx, g, () => {
      if ((slot.label || slot.sublabel) && !g.frame) drawLabel(ctx, slot, g, state);
      if (!isExport) drawUiOverlays(ctx, slot, g, i, state);
    });
  });

  // --- Yearly overlay text (side band) ---
  // top-left: 左帯・上寄せ / top-right: 右帯・上寄せ / bottom-left: 左帯・下寄せ
  if (state.template === 'yearly' && state.overlayEnabled && state.overlayText) {
    const oFontSize = state.overlayFontSize || 72;
    const overlayW = getOverlayBandWidth(state);
    const pos = state.overlayPosition || 'top-left';
    const bandX = pos === 'top-right' ? W - overlayW : 0;
    const margin = oFontSize;

    ctx.save();
    ctx.translate(bandX + overlayW / 2, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `bold ${oFontSize}px ${FONT}`;
    ctx.fillStyle = state.overlayColor || '#ffffff';
    ctx.textBaseline = 'middle';
    setShadow(ctx, 12);
    // 回転後の座標系: +x が画面の上方向、-x が下方向
    if (pos === 'bottom-left') {
      ctx.textAlign = 'left';
      ctx.fillText(state.overlayText, -H / 2 + margin, 0);
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(state.overlayText, H / 2 - margin, 0);
    }
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

// ==================== Hit testing ====================

export function hitTestSlot(slots, state, x4k, y4k) {
  for (let i = slots.length - 1; i >= 0; i--) {
    if (hitGeometry(getSlotGeometry(slots[i], state), x4k, y4k)) return i;
  }
  return -1;
}

export function hitTestDeleteButton(slots, state, x4k, y4k) {
  const btnR = state.deleteBtnR || 30;
  for (let i = slots.length - 1; i >= 0; i--) {
    const g = getSlotGeometry(slots[i], state);
    if (slots[i].photo) {
      const [lx, ly] = toLocal(g, x4k, y4k);
      const [bx, by] = deleteButtonCenter(g, btnR);
      if ((lx - bx) ** 2 + (ly - by) ** 2 <= btnR * btnR) return i;
    }
    // 上に重なっているスロットに当たったらそれより下は見ない
    if (hitGeometry(g, x4k, y4k)) return -1;
  }
  return -1;
}
