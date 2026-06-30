const W = 3840;
const H = 2160;

const WEEKLY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const MONTHLY_PATTERN_NAMES = {
  A: '縦4枚 → パターンA',
  B: '縦3+横1 → パターンB',
  C: '縦2+横2 → パターンC',
  D: '縦1+横3 → パターンD',
  E: '横4枚 → パターンE',
};

export function detectMonthlyPattern(photos) {
  const first4 = photos.slice(0, 4);
  if (first4.length === 0) return 'A';
  const vCount = first4.filter(p => p.naturalHeight > p.naturalWidth).length;
  if (vCount === first4.length) return 'A';
  if (vCount === 3) return 'B';
  if (vCount === 2) return 'C';
  if (vCount === 1) return 'D';
  return 'E';
}

export function getMonthlyPatternName(pattern) {
  return MONTHLY_PATTERN_NAMES[pattern] || '';
}

export function getTemplateConfig(template, photos) {
  switch (template) {
    case 'weekly':
      return buildWeekly();
    case 'monthly':
      return buildMonthly(photos);
    case 'yearly':
      return buildYearly();
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
  return { rows, cols, slots, hasLabels: false };
}

function buildWeekly() {
  const cols = 5;
  const slotW = W / cols;
  const slots = [];
  for (let i = 0; i < cols; i++) {
    slots.push({ x: i * slotW, y: 0, w: slotW, h: H, label: WEEKLY_LABELS[i] });
  }
  return { rows: 1, cols: 5, slots, hasLabels: true };
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

  return { rows: null, cols: null, slots, hasLabels: false, pattern };
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
      });
    }
  }
  return { rows: 2, cols: 6, slots, hasLabels: true };
}
