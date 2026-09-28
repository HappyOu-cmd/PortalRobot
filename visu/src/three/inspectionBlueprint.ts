import * as THREE from 'three';

const PAPER_WIDTH = 0.42;
const PAPER_HEIGHT = 0.297;

/** A printed assembly drawing; no network assets or canvas render loop are needed. */
function createDrawingTexture(): THREE.CanvasTexture | null {
  // Keep the prop usable by Node-based geometry/scene checks as well.
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1260;
  canvas.height = 891;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#f4f3eb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#546b7b';
  ctx.fillStyle = '#546b7b';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'miter';
  const line = (...points: [number, number][]): void => {
    ctx.beginPath();
    points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.stroke();
  };
  const text = (label: string, x: number, y: number, size = 13): void => {
    ctx.font = `${size}px Arial, sans-serif`;
    ctx.fillText(label, x, y);
  };
  const horizontalDimension = (x1: number, x2: number, baseY: number, y: number, label: string): void => {
    line([x1, baseY], [x1, y - 8]);
    line([x2, baseY], [x2, y - 8]);
    line([x1, y], [x2, y]);
    line([x1 + 9, y - 4], [x1, y], [x1 + 9, y + 4]);
    line([x2 - 9, y - 4], [x2, y], [x2 - 9, y + 4]);
    ctx.textAlign = 'center';
    text(label, (x1 + x2) / 2, y - 7);
    ctx.textAlign = 'left';
  };

  // Drawing border, reference zones and the assembly title.
  ctx.lineWidth = 2.4;
  ctx.strokeRect(45, 30, 1185, 831);
  ctx.lineWidth = 1.2;
  for (let i = 1; i < 6; i++) {
    const x = 45 + i * 197.5;
    line([x, 30], [x, 42]);
    line([x, 849], [x, 861]);
    text(String(i), x - 104, 24, 11);
  }
  text('ПОРТАЛЬНАЯ РОБОТИЗИРОВАННАЯ ЯЧЕЙКА', 85, 78, 21);
  text('Общий вид · Компоновочный чертёж', 85, 102, 14);

  // Front elevation: gantry truss, three CNC machines and two pallet magazines.
  ctx.lineWidth = 2.3;
  ctx.strokeRect(120, 235, 745, 26);
  ctx.strokeRect(117, 221, 751, 7);
  for (let x = 125; x < 850; x += 74) {
    line([x, 261], [x + 35, 235], [x + 70, 261]);
  }
  for (const x of [130, 485, 845]) {
    ctx.strokeRect(x, 261, 9, 162);
    ctx.strokeRect(x - 5, 423, 19, 6);
  }
  line([104, 430], [885, 430]);
  ctx.strokeRect(277, 176, 12, 73);
  ctx.strokeRect(262, 249, 41, 15);
  line([275, 264], [275, 292], [268, 303]);
  line([290, 264], [290, 292], [297, 303]);
  for (const x of [158, 417, 676]) {
    ctx.strokeRect(x, 309, 158, 113);
    ctx.strokeRect(x + 9, 320, 100, 81);
    ctx.strokeRect(x + 20, 332, 68, 59);
    ctx.strokeRect(x + 119, 325, 26, 24);
    ctx.strokeRect(x + 119, 356, 26, 36);
    line([x + 6, 407], [x + 151, 407]);
    for (let row = 0; row < 4; row++) {
      line([x + 122, 362 + row * 6], [x + 141, 362 + row * 6]);
    }
  }
  for (const x of [335, 594]) {
    ctx.strokeRect(x, 353, 61, 14);
    line([x + 6, 367], [x + 6, 422], [x + 55, 422], [x + 55, 367]);
    line([x + 6, 393], [x + 55, 393]);
    for (let slot = 0; slot < 6; slot++) ctx.strokeRect(x + 4 + slot * 9, 341, 6, 12);
  }
  ctx.lineWidth = 1;
  horizontalDimension(120, 865, 221, 145, '12 000');
  horizontalDimension(158, 316, 309, 285, '2 400');
  line([99, 221], [81, 221], [81, 430], [99, 430]);
  line([77, 230], [81, 221], [85, 230]);
  line([77, 421], [81, 430], [85, 421]);
  ctx.save();
  ctx.translate(73, 348);
  ctx.rotate(-Math.PI / 2);
  text('3 600', 0, 0);
  ctx.restore();
  text('ВИД СПЕРЕДИ', 388, 459, 13);

  // Top view, with dashed machine axes and magazine pallet grids.
  ctx.lineWidth = 1.6;
  ctx.strokeRect(120, 537, 745, 141);
  ctx.strokeRect(120, 538, 745, 15);
  for (const x of [158, 417, 676]) {
    ctx.strokeRect(x, 574, 158, 89);
    ctx.strokeRect(x + 12, 582, 104, 64);
    ctx.setLineDash([9, 4, 2, 4]);
    line([x + 64, 560], [x + 64, 689]);
    ctx.setLineDash([]);
  }
  for (const x of [335, 594]) {
    ctx.strokeRect(x, 584, 61, 74);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.strokeRect(x + 6 + col * 13, 590 + row * 12, 9, 8);
      }
    }
  }
  horizontalDimension(120, 865, 537, 507, '12 000');
  text('ПЛАН РАЗМЕЩЕНИЯ', 366, 710, 13);

  // End elevation and leader callouts give the print the density of a real sheet.
  ctx.strokeRect(944, 235, 188, 26);
  ctx.strokeRect(950, 261, 10, 163);
  ctx.strokeRect(1113, 261, 10, 163);
  ctx.strokeRect(976, 310, 119, 114);
  ctx.strokeRect(988, 325, 80, 70);
  line([930, 430], [1150, 430]);
  horizontalDimension(944, 1132, 235, 195, '2 800');
  text('ВИД СБОКУ', 997, 459, 13);
  line([748, 242], [791, 184], [849, 184]);
  text('1', 853, 188);
  line([1057, 340], [1157, 294], [1189, 294]);
  text('2', 1192, 298);
  text('1. Портальный робот', 922, 536, 14);
  text('2. Станок с ЧПУ — 3 шт.', 922, 562, 14);
  text('3. Магазин заготовок', 922, 588, 14);
  text('Размеры указаны в мм.', 922, 636, 12);

  // Revision table and standard-style bottom-right title block.
  ctx.strokeRect(668, 738, 562, 123);
  line([668, 771], [1230, 771]);
  line([668, 824], [1230, 824]);
  line([1016, 738], [1016, 861]);
  line([1123, 824], [1123, 861]);
  text('PR-CELL.00.000 СБ', 692, 761, 17);
  text('ПОРТАЛЬНАЯ ЯЧЕЙКА', 692, 796, 19);
  text('Сборочный чертёж', 692, 816, 13);
  text('Масштаб 1:50', 1033, 761, 13);
  text('Лист 1', 1033, 847, 14);
  text('A3', 1155, 847, 16);
  text('Компоновка оборудования', 692, 847, 12);
  ctx.strokeRect(86, 764, 305, 97);
  for (let row = 1; row < 4; row++) line([86, 764 + row * 24], [391, 764 + row * 24]);
  line([164, 764], [164, 861]);
  line([314, 764], [314, 861]);
  text('Изм.', 97, 782, 12);
  text('Подпись', 195, 782, 12);
  text('Дата', 338, 782, 12);
  text('Разраб.', 94, 806, 12);
  text('Пров.', 94, 830, 12);
  text('Н. контр.', 94, 854, 12);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'inspection_blueprint_print';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * A3 landscape sheet in local XY, front normal +Z; dimensions are in metres.
 * The caller owns disposal of its geometry, material and optional map texture.
 */
export function createInspectionBlueprint(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'inspection_blueprint';
  const geometry = new THREE.PlaneGeometry(PAPER_WIDTH, PAPER_HEIGHT, 32, 12);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / (PAPER_WIDTH / 2);
    const y = positions.getY(i) / (PAPER_HEIGHT / 2);
    // Broad soft bow with slightly twisted corners, as paper held in two hands.
    positions.setZ(i, 0.014 * x * x + 0.003 * y * y + 0.003 * x * y);
  }
  geometry.center();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    name: 'inspection_blueprint_paper',
    color: 0xfaf9f4,
    map: createDrawingTexture(),
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const paper = new THREE.Mesh(geometry, material);
  paper.name = 'inspection_blueprint_a3_sheet';
  paper.castShadow = true;
  paper.receiveShadow = true;
  paper.raycast = () => {};
  root.add(paper);
  return root;
}
