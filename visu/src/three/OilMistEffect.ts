import * as THREE from 'three';

const CLOUD_COUNT = 6;
const PARTICLE_COUNT = 1400;
const PARTICLE_BOUNDS = {
  minX: 0.03,
  maxX: 1.08,
  minY: -0.48,
  maxY: 0.58,
  minZ: -0.5,
  maxZ: 0.5,
};

interface CloudLayer {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  origin: THREE.Vector3;
  baseScale: THREE.Vector2;
  phase: number;
  speed: number;
}

function createNoiseTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const radius = Math.sqrt(nx * nx + ny * ny);
      const radial = THREE.MathUtils.smoothstep(1 - radius, 0, 0.82);
      const coarse = 0.5 + 0.5 * Math.sin(nx * 11.7 + Math.sin(ny * 8.3) * 2.1);
      const fine = Math.random() * 0.52 + coarse * 0.48;
      const alpha = Math.round(255 * radial * THREE.MathUtils.clamp(fine, 0, 1));
      const offset = (y * size + x) * 4;
      image.data[offset] = 214;
      image.data[offset + 1] = 222;
      image.data[offset + 2] = 219;
      image.data[offset + 3] = alpha;
    }
  }

  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.center.set(0.5, 0.5);
  texture.needsUpdate = true;
  return texture;
}

function createDropletMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uIntensity;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float drops(vec2 uv, vec2 cells, float speed, float seed) {
        vec2 grid = uv * cells;
        vec2 id = floor(grid);
        vec2 p = fract(grid) - 0.5;
        float randomValue = hash21(id + seed);
        p.x += (randomValue - 0.5) * 0.62;
        p.y = fract(p.y + 0.5 + uTime * speed * (0.55 + randomValue) + randomValue) - 0.5;
        float radius = mix(0.08, 0.22, hash21(id + seed + 7.1));
        vec2 shape = vec2(p.x, p.y * 0.42);
        float body = 1.0 - smoothstep(radius, radius + 0.055, length(shape));
        float appears = smoothstep(1.0 - uIntensity * 0.075, 1.0, randomValue);
        return body * appears;
      }

      void main() {
        float layerA = drops(vUv, vec2(13.0, 22.0), 0.055, 1.3);
        float layerB = drops(vUv + vec2(0.17, 0.09), vec2(21.0, 34.0), 0.035, 8.7);
        float layerC = drops(vUv + vec2(0.31, 0.21), vec2(9.0, 15.0), 0.075, 17.4);
        float edge = smoothstep(0.015, 0.075, vUv.x) * smoothstep(0.015, 0.075, 1.0 - vUv.x)
          * smoothstep(0.015, 0.075, vUv.y) * smoothstep(0.015, 0.075, 1.0 - vUv.y);
        float alpha = clamp(layerA * 0.22 + layerB * 0.15 + layerC * 0.27, 0.0, 0.28) * edge * uIntensity;
        gl_FragColor = vec4(vec3(0.68, 0.75, 0.72), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export class OilMistEffect {
  private readonly root = new THREE.Group();
  private readonly noiseTexture = createNoiseTexture();
  private readonly clouds: CloudLayer[] = [];
  private readonly particleGeometry = new THREE.BufferGeometry();
  private readonly particleMaterial = new THREE.PointsMaterial({
    color: 0xc7d2ce,
    size: 0.016,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  private readonly particles: THREE.Points;
  private readonly positions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly velocities = new Float32Array(PARTICLE_COUNT * 3);
  private readonly lifetimes = new Float32Array(PARTICLE_COUNT);
  private readonly phases = new Float32Array(PARTICLE_COUNT);
  private readonly dropletGeometry = new THREE.PlaneGeometry(0.63, 0.83);
  private readonly dropletMaterial = createDropletMaterial();
  private readonly dropletMask = new THREE.Mesh(this.dropletGeometry, this.dropletMaterial);
  private active = false;
  private intensity = 0;
  private time = 0;

  constructor(machineRoot: THREE.Object3D, chuck: THREE.Object3D, door: THREE.Object3D) {
    this.root.name = 'oil_mist_effect';
    this.root.position.copy(chuck.position);
    (chuck.parent ?? machineRoot).add(this.root);

    for (let index = 0; index < CLOUD_COUNT; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.noiseTexture,
        color: 0xb9c5c0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        rotation: Math.random() * Math.PI * 2,
      });
      const sprite = new THREE.Sprite(material);
      const origin = new THREE.Vector3(
        0.12 + Math.random() * 0.42,
        -0.08 + Math.random() * 0.3,
        -0.12 + Math.random() * 0.24,
      );
      const baseScale = new THREE.Vector2(0.32 + Math.random() * 0.28, 0.24 + Math.random() * 0.24);
      sprite.position.copy(origin);
      sprite.scale.set(baseScale.x, baseScale.y, 1);
      sprite.renderOrder = 4;
      this.root.add(sprite);
      this.clouds.push({ sprite, material, origin, baseScale, phase: Math.random() * Math.PI * 2, speed: 0.35 + Math.random() * 0.55 });
    }

    for (let index = 0; index < PARTICLE_COUNT; index += 1) this.resetParticle(index, Math.random());
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.particles.name = 'oil_mist_particles';
    this.particles.frustumCulled = false;
    this.particles.renderOrder = 3;
    this.root.add(this.particles);

    this.dropletMask.name = 'oil_drops_on_glass';
    this.dropletMask.position.set(0.455, 0, 0.218);
    this.dropletMask.renderOrder = 7;
    door.add(this.dropletMask);
    this.setVisible(false);
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  update(dt: number): void {
    const frameTime = Math.min(dt, 0.05);
    const target = this.active ? 1 : 0;
    this.intensity = THREE.MathUtils.lerp(this.intensity, target, 1 - Math.exp(-frameTime * (this.active ? 1.6 : 2.8)));
    this.time += frameTime;
    this.setVisible(this.intensity > 0.01);
    if (this.intensity <= 0.01) return;

    this.noiseTexture.offset.x = Math.sin(this.time * 0.07) * 0.035;
    this.noiseTexture.offset.y = this.time * 0.018;
    this.noiseTexture.rotation = this.time * 0.025;

    this.clouds.forEach((cloud, index) => {
      const wave = this.time * cloud.speed + cloud.phase;
      cloud.sprite.position.set(
        cloud.origin.x + Math.sin(wave * 0.7) * 0.07,
        cloud.origin.y + Math.sin(wave) * 0.06 + this.intensity * 0.035,
        cloud.origin.z + Math.cos(wave * 0.63) * 0.05,
      );
      const scalePulse = 0.86 + Math.sin(wave * 0.8 + index) * 0.12 + this.intensity * 0.14;
      cloud.sprite.scale.set(cloud.baseScale.x * scalePulse, cloud.baseScale.y * scalePulse, 1);
      cloud.material.rotation += frameTime * (index % 2 === 0 ? 0.08 : -0.06);
      cloud.material.opacity = this.intensity * (0.15 + 0.045 * Math.sin(wave));
    });

    this.updateParticles(frameTime);
    this.particleMaterial.opacity = this.intensity * 0.4;
    this.dropletMaterial.uniforms.uTime.value = this.time;
    this.dropletMaterial.uniforms.uIntensity.value = this.intensity;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.dropletMask.removeFromParent();
    this.clouds.forEach(({ sprite, material }) => {
      sprite.removeFromParent();
      material.dispose();
    });
    this.noiseTexture.dispose();
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.dropletGeometry.dispose();
    this.dropletMaterial.dispose();
  }

  private setVisible(visible: boolean): void {
    this.root.visible = visible;
    this.dropletMask.visible = visible;
  }

  private resetParticle(index: number, progress = 0): void {
    const offset = index * 3;
    const lifetime = 2.5 + Math.random() * 3.5;
    const direction = new THREE.Vector3(
      0.35 + Math.random() * 0.8,
      (Math.random() - 0.5) * 1.35,
      (Math.random() - 0.5) * 1.55,
    ).normalize();
    const speed = 0.07 + Math.random() * 0.16;
    const travelled = progress * (0.08 + Math.random() * 0.42);
    this.lifetimes[index] = progress * lifetime;
    this.phases[index] = Math.random() * Math.PI * 2;
    this.positions[offset] = 0.08 + direction.x * travelled;
    this.positions[offset + 1] = direction.y * travelled;
    this.positions[offset + 2] = direction.z * travelled;
    this.velocities[offset] = direction.x * speed;
    this.velocities[offset + 1] = direction.y * speed;
    this.velocities[offset + 2] = direction.z * speed;
  }

  private updateParticles(dt: number): void {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 3;
      this.lifetimes[index] += dt;
      const turbulence = this.time * 1.35 + this.phases[index];
      this.positions[offset] += (this.velocities[offset] + Math.sin(turbulence * 0.71) * 0.012) * dt;
      this.positions[offset + 1] += (this.velocities[offset + 1] + Math.sin(turbulence) * 0.02 + 0.006) * dt;
      this.positions[offset + 2] += (this.velocities[offset + 2] + Math.cos(turbulence * 0.83) * 0.022) * dt;

      if (this.positions[offset] < PARTICLE_BOUNDS.minX || this.positions[offset] > PARTICLE_BOUNDS.maxX) {
        this.positions[offset] = THREE.MathUtils.clamp(this.positions[offset], PARTICLE_BOUNDS.minX, PARTICLE_BOUNDS.maxX);
        this.velocities[offset] *= -0.32;
      }
      if (this.positions[offset + 1] < PARTICLE_BOUNDS.minY || this.positions[offset + 1] > PARTICLE_BOUNDS.maxY) {
        this.positions[offset + 1] = THREE.MathUtils.clamp(this.positions[offset + 1], PARTICLE_BOUNDS.minY, PARTICLE_BOUNDS.maxY);
        this.velocities[offset + 1] *= -0.32;
      }
      if (this.positions[offset + 2] < PARTICLE_BOUNDS.minZ || this.positions[offset + 2] > PARTICLE_BOUNDS.maxZ) {
        this.positions[offset + 2] = THREE.MathUtils.clamp(this.positions[offset + 2], PARTICLE_BOUNDS.minZ, PARTICLE_BOUNDS.maxZ);
        this.velocities[offset + 2] *= -0.32;
      }

      if (this.lifetimes[index] > 6) {
        this.resetParticle(index);
      }
    }
    (this.particleGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
