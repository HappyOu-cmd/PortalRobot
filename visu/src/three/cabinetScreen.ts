import * as THREE from 'three';

export interface CabinetScreenRig {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  texture: THREE.CanvasTexture;
  context: CanvasRenderingContext2D;
  background: HTMLCanvasElement;
  frame: number;
}

const WIDTH = 768;
const HEIGHT = 432;
const MACHINE_XS = [134, 356, 578];

function line(ctx: CanvasRenderingContext2D, points: number[][], color: string, width = 2): void {
  ctx.beginPath();
  points.forEach(([x, y], index) => index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawBackground(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#102b3b');
  gradient.addColorStop(1, '#080f1c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (let x = 24; x < WIDTH; x += 32) line(ctx, [[x, 100], [x, 355]], '#162b39', 1);
  for (let y = 112; y < 355; y += 32) line(ctx, [[28, y], [740, y]], '#162b39', 1);

  ctx.font = '600 28px "Segoe UI", sans-serif';
  ctx.fillStyle = '#d0e3ed';
  ctx.fillText('PORTAL / ROBOT', 32, 48);

  // Gantry rail, three CNC bodies and two fixed pallet grids.
  line(ctx, [[64, 305], [64, 139], [702, 139], [702, 305]], '#557b8e', 4);
  line(ctx, [[64, 152], [702, 152]], '#3b667b', 3);
  MACHINE_XS.forEach((x, index) => {
    ctx.fillStyle = '#193547';
    ctx.fillRect(x - 62, 232, 124, 83);
    ctx.strokeStyle = '#678595';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 62, 232, 124, 83);
    ctx.fillStyle = '#0a1a29';
    ctx.fillRect(x - 46, 244, 62, 57);
    line(ctx, [[x + 22, 244], [x + 47, 244], [x + 47, 269], [x + 22, 269], [x + 22, 244]], '#458599');
    line(ctx, [[x + 25, 282], [x + 46, 282]], '#618091', 3);
    ctx.fillStyle = '#87a7b9';
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`CNC ${index + 1}`, x, 342);
  });
  for (const x of [245, 467]) {
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        ctx.fillStyle = '#335b70';
        ctx.fillRect(x - 20 + col * 15, 270 + row * 11, 10, 7);
      }
    }
  }
  ctx.textAlign = 'left';
  line(ctx, [[32, 368], [736, 368]], '#264454', 1);
  line(ctx, [[515, 398], [732, 398]], '#234252', 3);
}

/** Small animated canvas, drawn at 15 fps inside the scene's existing render loop. */
export function createCabinetScreen(width: number, height: number): CabinetScreenRig {
  const background = document.createElement('canvas');
  background.width = WIDTH;
  background.height = HEIGHT;
  const backgroundContext = background.getContext('2d')!;
  drawBackground(backgroundContext);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, color: 0xb0bec9, toneMapped: false }));
  mesh.name = 'operator_panel_animated_screen';
  const rig = { mesh, texture, context, background, frame: -1 };
  updateCabinetScreen(rig, 0, false);
  return rig;
}

export function updateCabinetScreen(rig: CabinetScreenRig, elapsed: number, reducedMotion: boolean): void {
  const time = reducedMotion ? 0 : elapsed;
  const frame = Math.floor(time * 15);
  if (frame === rig.frame) return;
  rig.frame = frame;
  const ctx = rig.context;
  ctx.drawImage(rig.background, 0, 0);

  // Slow 24-second loop: dwell over each CNC, lower the gripper, then travel.
  const cycle = (time % 24) / 8;
  const station = Math.floor(cycle);
  const phase = cycle - station;
  const travel = THREE.MathUtils.smoothstep(phase, 0.45, 1);
  const x = THREE.MathUtils.lerp(MACHINE_XS[station], MACHINE_XS[(station + 1) % 3], travel);
  const drop = phase < 0.45 ? Math.sin(phase / 0.45 * Math.PI) ** 2 : 0;
  const tipY = 203 + drop * 45;

  ctx.fillStyle = '#346c82';
  ctx.fillRect(x - 23, 130, 46, 31);
  ctx.strokeStyle = '#87c4d2';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 23, 130, 46, 31);
  line(ctx, [[x, 161], [x, tipY]], '#a5d3df', 6);
  line(ctx, [[x - 12, tipY - 4], [x - 12, tipY + 12], [x - 5, tipY + 16]], '#70b8c8', 3);
  line(ctx, [[x + 12, tipY - 4], [x + 12, tipY + 12], [x + 5, tipY + 16]], '#70b8c8', 3);
  ctx.fillStyle = `rgba(96, 188, 198, ${0.10 + drop * 0.14})`;
  ctx.fillRect(x - 18, 248, 36, 46);
  ctx.fillStyle = '#6bafc0';
  ctx.beginPath();
  ctx.arc(515 + (time % 24) / 24 * 217, 398, 4, 0, Math.PI * 2);
  ctx.fill();
  rig.texture.needsUpdate = true;
}
