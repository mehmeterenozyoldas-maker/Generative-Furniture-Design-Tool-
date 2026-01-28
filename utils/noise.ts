import { Vector3 } from 'three';

// Simple 3D value noise (fast, dependency-free)

function hash3i(x: number, y: number, z: number): number {
  // integer hash -> [0,1)
  let n = x * 374761393 + y * 668265263 + z * 2147483647;
  n = (n ^ (n >> 13)) >>> 0;
  n = (n * 1274126177) >>> 0;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function noise3(x: number, y: number, z: number): number {
  // trilinear interpolation of hashed lattice values
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = smoothstep(xf), v = smoothstep(yf), w = smoothstep(zf);

  const v000 = hash3i(xi, yi, zi);
  const v100 = hash3i(xi + 1, yi, zi);
  const v010 = hash3i(xi, yi + 1, zi);
  const v110 = hash3i(xi + 1, yi + 1, zi);
  const v001 = hash3i(xi, yi, zi + 1);
  const v101 = hash3i(xi + 1, yi, zi + 1);
  const v011 = hash3i(xi, yi + 1, zi + 1);
  const v111 = hash3i(xi + 1, yi + 1, zi + 1);

  const x00 = lerp(v000, v100, u);
  const x10 = lerp(v010, v110, u);
  const x01 = lerp(v001, v101, u);
  const x11 = lerp(v011, v111, u);
  const y0  = lerp(x00, x10, v);
  const y1  = lerp(x01, x11, v);
  return lerp(y0, y1, w);
}

export function noiseVec3(p: Vector3, scale: number): Vector3 {
  // decorrelate channels by offsetting coordinates
  const x = noise3(p.x * scale + 12.7, p.y * scale + 78.2, p.z * scale + 3.1);
  const y = noise3(p.x * scale + 45.1, p.y * scale + 10.5, p.z * scale + 91.7);
  const z = noise3(p.x * scale + 8.3,  p.y * scale + 63.9, p.z * scale + 27.4);
  return new Vector3(x - 0.5, y - 0.5, z - 0.5);
}