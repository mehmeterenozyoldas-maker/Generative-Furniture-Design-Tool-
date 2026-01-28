import { Vector3, MathUtils, Quaternion } from 'three';
import { noise3 } from './noise';

export interface NetworkData {
  nodes: Vector3[];
  edges: [number, number][];
}

export type FurnitureType = 'Chair' | 'Table' | 'Stool' | 'Bench' | 'Shelf' | 'Vase' | 'Recliner' | 'Lamp' | 'Mobius';
export type FurniturePattern = 'Linear' | 'Voronoi' | 'Gyroid' | 'Triangular';

export interface FurnitureParams {
  width: number;
  height: number;
  depth: number;
  seatHeight: number;
  pattern: FurniturePattern;
}

// ---------------------
// Helpers
// ---------------------
const addNode = (nodes: Vector3[], x: number, y: number, z: number) => nodes.push(new Vector3(x, y, z)) - 1;
const link = (edges: [number, number][], a: number, b: number) => edges.push([a, b]);

// ---------------------
// Volume Definitions (SDF-ish)
// ---------------------

function isInsideFurniture(type: FurnitureType, x: number, y: number, z: number, params: FurnitureParams): boolean {
  const { width, height, depth, seatHeight } = params;
  const w2 = width / 2;
  const d2 = depth / 2;

  // Helper for Box
  const inBox = (bx: number, by: number, bz: number, bw: number, bh: number, bd: number) => {
    return Math.abs(x - bx) <= bw/2 && y >= by && y <= by + bh && Math.abs(z - bz) <= bd/2;
  };

  if (type === 'Table') {
    // Solid block for table in volume mode, or Top + Legs
    // Let's do Top + Legs for a more distinct shape
    const legThick = width * 0.15;
    const topThick = height * 0.1;
    
    const inTop = inBox(0, height - topThick, 0, width, topThick, depth);
    const inLegFL = inBox(-w2 + legThick/2, 0, d2 - legThick/2, legThick, height, legThick);
    const inLegFR = inBox(w2 - legThick/2, 0, d2 - legThick/2, legThick, height, legThick);
    const inLegBL = inBox(-w2 + legThick/2, 0, -d2 + legThick/2, legThick, height, legThick);
    const inLegBR = inBox(w2 - legThick/2, 0, -d2 + legThick/2, legThick, height, legThick);

    return inTop || inLegFL || inLegFR || inLegBL || inLegBR;
  }

  if (type === 'Chair') {
    const legThick = width * 0.12;
    const seatThick = height * 0.08;
    const backThick = depth * 0.15;

    // Legs
    const inLegFL = inBox(-w2 + legThick/2, 0, d2 - legThick/2, legThick, seatHeight, legThick);
    const inLegFR = inBox(w2 - legThick/2, 0, d2 - legThick/2, legThick, seatHeight, legThick);
    const inLegBL = inBox(-w2 + legThick/2, 0, -d2 + legThick/2, legThick, seatHeight, legThick);
    const inLegBR = inBox(w2 - legThick/2, 0, -d2 + legThick/2, legThick, seatHeight, legThick);
    
    // Seat
    const inSeat = inBox(0, seatHeight, 0, width, seatThick, depth);
    
    // Backrest
    const inBack = inBox(0, seatHeight, -d2 + backThick/2, width, height - seatHeight, backThick);

    return inLegFL || inLegFR || inLegBL || inLegBR || inSeat || inBack;
  }

  if (type === 'Stool') {
    // Cylinder shape
    const rTop = width / 2;
    const rBot = width / 1.5;
    const rAtY = MathUtils.lerp(rBot, rTop, y / height);
    return (x*x + z*z) <= rAtY*rAtY && y >= 0 && y <= height;
  }

  if (type === 'Bench') {
    // Simple block bench
    const topThick = height * 0.15;
    const legThick = width * 0.1; 
    
    const inTop = inBox(0, height - topThick, 0, width, topThick, depth);
    const inLegL = inBox(-w2 + legThick/2, 0, 0, legThick, height, depth);
    const inLegR = inBox(w2 - legThick/2, 0, 0, legThick, height, depth);
    
    return inTop || inLegL || inLegR;
  }

  if (type === 'Vase') {
    const baseRadius = width * 0.4;
    const t = y / height;
    const bulge = Math.sin(t * Math.PI) * 0.3;
    const rad = baseRadius + bulge + (t * 0.1);
    // Hollow vase? Volume mode usually makes solid lattices.
    // Let's make it a shell if we want, but solid lattice is stronger.
    return (x*x + z*z) <= rad*rad && y >= 0 && y <= height;
  }
  
  // Default fallback to box
  return inBox(0, 0, 0, width, height, depth);
}

// ---------------------
// Pattern Generators
// ---------------------

function generateVolumeGyroid(nodes: Vector3[], edges: [number, number][], params: FurnitureParams, type: FurnitureType) {
  const { width, height, depth } = params;
  
  // Resolution
  const res = 0.08; // Higher res for finer detail
  const scale = 8.0; // Pattern frequency
  
  const nx = Math.ceil(width / res) + 2;
  const ny = Math.ceil(height / res) + 2;
  const nz = Math.ceil(depth / res) + 2;
  
  const idx = (x: number, y: number, z: number) => x + y * nx + z * nx * ny;
  const nodeMap = new Map<number, number>();

  const offsetX = -width/2 - res;
  const offsetY = -res;
  const offsetZ = -depth/2 - res;

  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      for (let z = 0; z < nz; z++) {
        
        const wx = offsetX + x * res;
        const wy = offsetY + y * res;
        const wz = offsetZ + z * res;

        // Check bounding volume
        if (!isInsideFurniture(type, wx, wy, wz, params)) continue;

        // Gyroid Math
        const gx = wx * scale;
        const gy = wy * scale;
        const gz = wz * scale;
        const val = Math.sin(gx)*Math.cos(gy) + Math.sin(gy)*Math.cos(gz) + Math.sin(gz)*Math.cos(gx);
        
        // Solidify the gyroid wall
        if (Math.abs(val) < 0.5) {
             const realIdx = addNode(nodes, wx, wy, wz);
             nodeMap.set(idx(x,y,z), realIdx);
        }
      }
    }
  }

  // Connect
  nodeMap.forEach((realIdx, gridId) => {
    const z = Math.floor(gridId / (nx * ny));
    const y = Math.floor((gridId - z * nx * ny) / nx);
    const x = gridId % nx;

    // 6-neighbor connectivity for lattice
    const neighbors = [
      [x+1, y, z],
      [x, y+1, z],
      [x, y, z+1]
    ];

    neighbors.forEach(([nx_coord, ny_coord, nz_coord]) => {
      const nid = idx(nx_coord, ny_coord, nz_coord);
      if (nodeMap.has(nid)) {
        link(edges, realIdx, nodeMap.get(nid)!);
      }
    });
  });
}

function generateVolumeVoronoi(nodes: Vector3[], edges: [number, number][], params: FurnitureParams, type: FurnitureType) {
  const { width, height, depth } = params;
  
  // Scatter points inside the volume
  const volumeApprox = width * height * depth; 
  // Density: points per cubic meter
  const density = 600; 
  const count = Math.max(50, Math.floor(volumeApprox * density));
  
  const points: { id: number, vec: Vector3 }[] = [];
  
  // Rejection sampling for shape
  let attempts = 0;
  while(points.length < count && attempts < count * 10) {
    attempts++;
    const x = (Math.random() - 0.5) * width;
    const y = Math.random() * height;
    const z = (Math.random() - 0.5) * depth;
    
    if (isInsideFurniture(type, x, y, z, params)) {
      // Jitter slightly for more organic look
      const px = x + (Math.random()-0.5)*0.05;
      const py = y + (Math.random()-0.5)*0.05;
      const pz = z + (Math.random()-0.5)*0.05;
      const id = addNode(nodes, px, py, pz);
      points.push({ id, vec: new Vector3(px, py, pz) });
    }
  }
  
  // Connect neighbors (K-nearest or Distance-based)
  // Distance based gives varying truss density
  // Let's use a dynamic distance based on overall density
  // V = L^3, L = V^(1/3). Avg dist ~ L / N^(1/3)
  const avgDist = Math.pow(volumeApprox / count, 1/3);
  const threshold = avgDist * 1.8; 

  // Optimization: Spatial grid or brute force? 
  // With < 1000 points, brute force is fine (1M checks ~ 5-10ms)
  for(let i=0; i<points.length; i++) {
    for(let j=i+1; j<points.length; j++) {
      const d = points[i].vec.distanceTo(points[j].vec);
      if (d < threshold) {
        link(edges, points[i].id, points[j].id);
      }
    }
  }
}

function generateVolumeTriangular(nodes: Vector3[], edges: [number, number][], params: FurnitureParams, type: FurnitureType) {
    const { width, height, depth } = params;
    
    // Space Frame Logic
    const cellSize = 0.15; // Grid size
    
    const nx = Math.ceil(width / cellSize);
    const ny = Math.ceil(height / cellSize);
    const nz = Math.ceil(depth / cellSize);
    
    const idx = (x: number, y: number, z: number) => x + y * nx + z * nx * ny;
    const nodeMap = new Map<number, number>();
  
    const offsetX = -width/2;
    const offsetY = 0;
    const offsetZ = -depth/2;
  
    // 1. Generate Grid Points
    for (let x = 0; x <= nx; x++) {
      for (let y = 0; y <= ny; y++) {
        for (let z = 0; z <= nz; z++) {
          const wx = offsetX + x * cellSize;
          const wy = offsetY + y * cellSize;
          const wz = offsetZ + z * cellSize;
  
          if (isInsideFurniture(type, wx, wy, wz, params)) {
             const realIdx = addNode(nodes, wx, wy, wz);
             nodeMap.set(idx(x,y,z), realIdx);
          }
        }
      }
    }
  
    // 2. Connect with diagonals (Tetrahedral-ish)
    nodeMap.forEach((realIdx, gridId) => {
      const z = Math.floor(gridId / (nx * ny));
      const y = Math.floor((gridId - z * nx * ny) / nx);
      const x = gridId % nx;
  
      // Neighbors: Orthogonal + Diagonals for structural rigidity
      const neighborOffsets = [
        [1, 0, 0], [0, 1, 0], [0, 0, 1],
        [1, 1, 0], [1, 0, 1], [0, 1, 1], // Face diagonals
        [1, 1, 1] // Space diagonal
      ];
  
      neighborOffsets.forEach(([dx, dy, dz]) => {
        const nid = idx(x+dx, y+dy, z+dz);
        if (nodeMap.has(nid)) {
           link(edges, realIdx, nodeMap.get(nid)!);
        }
      });
    });
  }

// ---------------------
// Linear (Skeleton) Generators
// ---------------------
// (Kept for 'Linear' pattern)

function generateLinearChair(nodes: Vector3[], edges: [number, number][], params: FurnitureParams) {
    const { width, height, depth, seatHeight } = params;
    const w2 = width / 2;
    const d2 = depth / 2;
    // Floor Contacts
    const fl_b = addNode(nodes, -w2, 0, d2);
    const fr_b = addNode(nodes, w2, 0, d2);
    const bl_b = addNode(nodes, -w2, 0, -d2);
    const br_b = addNode(nodes, w2, 0, -d2);
    // Seat Level
    const fl_s = addNode(nodes, -w2, seatHeight, d2);
    const fr_s = addNode(nodes, w2, seatHeight, d2);
    const bl_s = addNode(nodes, -w2, seatHeight, -d2);
    const br_s = addNode(nodes, w2, seatHeight, -d2);
    // Backrest Top
    const bl_t = addNode(nodes, -w2, height, -d2);
    const br_t = addNode(nodes, w2, height, -d2);

    link(edges, fl_b, fl_s); link(edges, fr_b, fr_s);
    link(edges, bl_b, bl_s); link(edges, br_b, br_s);
    link(edges, fl_s, fr_s); link(edges, fr_s, br_s);
    link(edges, br_s, bl_s); link(edges, bl_s, fl_s);
    link(edges, fl_s, br_s); link(edges, fr_s, bl_s);
    link(edges, bl_s, bl_t); link(edges, br_s, br_t); 
    link(edges, bl_t, br_t); 
    link(edges, bl_t, br_s); link(edges, br_t, bl_s); 
    
    const stretch_h = seatHeight * 0.3;
    const fl_str = addNode(nodes, -w2, stretch_h, d2);
    const fr_str = addNode(nodes, w2, stretch_h, d2);
    const bl_str = addNode(nodes, -w2, stretch_h, -d2);
    const br_str = addNode(nodes, w2, stretch_h, -d2);
    link(edges, fl_str, bl_str);
    link(edges, fr_str, br_str);
}

function generateLinearTable(nodes: Vector3[], edges: [number, number][], params: FurnitureParams) {
    const { width, height, depth } = params;
    const w2 = width / 2;
    const d2 = depth / 2;
    const fl_b = addNode(nodes, -w2, 0, d2);
    const fr_b = addNode(nodes, w2, 0, d2);
    const bl_b = addNode(nodes, -w2, 0, -d2);
    const br_b = addNode(nodes, w2, 0, -d2);
    const fl_t = addNode(nodes, -w2, height, d2);
    const fr_t = addNode(nodes, w2, height, d2);
    const bl_t = addNode(nodes, -w2, height, -d2);
    const br_t = addNode(nodes, w2, height, -d2);

    link(edges, fl_b, fl_t); link(edges, fr_b, fr_t);
    link(edges, bl_b, bl_t); link(edges, br_b, br_t);
    link(edges, fl_t, fr_t); link(edges, fr_t, br_t);
    link(edges, br_t, bl_t); link(edges, bl_t, fl_t);
    
    const tm_f = addNode(nodes, 0, height, d2); 
    const tm_b = addNode(nodes, 0, height, -d2); 
    const tm_l = addNode(nodes, -w2, height, 0); 
    const tm_r = addNode(nodes, w2, height, 0); 
    const center = addNode(nodes, 0, height, 0);
    link(edges, fl_t, tm_f); link(edges, tm_f, fr_t);
    link(edges, bl_t, tm_b); link(edges, tm_b, br_t);
    link(edges, fl_t, tm_l); link(edges, tm_l, bl_t);
    link(edges, fr_t, tm_r); link(edges, tm_r, br_t);
    link(edges, tm_l, center); link(edges, center, tm_r);
    link(edges, tm_f, center); link(edges, center, tm_b);
}

function generateLinearStool(nodes: Vector3[], edges: [number, number][], params: FurnitureParams) {
    const { width, height } = params;
    const radiusTop = width / 2;
    const radiusBot = width / 1.5; 
    const steps = 4;
    const topIndices: number[] = [];
    const botIndices: number[] = [];
    for (let i = 0; i < steps; i++) {
      const theta = (i / steps) * Math.PI * 2 + (Math.PI/4);
      botIndices.push(addNode(nodes, Math.cos(theta) * radiusBot, 0, Math.sin(theta) * radiusBot));
      topIndices.push(addNode(nodes, Math.cos(theta) * radiusTop, height, Math.sin(theta) * radiusTop));
    }
    for (let i = 0; i < steps; i++) {
      const next = (i + 1) % steps;
      link(edges, botIndices[i], topIndices[i]);
      link(edges, topIndices[i], topIndices[next]);
      link(edges, botIndices[i], topIndices[next]);
      const restH = height * 0.3;
      const rRest = MathUtils.lerp(radiusBot, radiusTop, 0.3);
      const restA = addNode(nodes, Math.cos((i/steps)*Math.PI*2 + Math.PI/4) * rRest, restH, Math.sin((i/steps)*Math.PI*2 + Math.PI/4) * rRest);
      const restB = addNode(nodes, Math.cos(((i+1)/steps)*Math.PI*2 + Math.PI/4) * rRest, restH, Math.sin(((i+1)/steps)*Math.PI*2 + Math.PI/4) * rRest);
      link(edges, restA, restB);
    }
}

// ---------------------
// Special Case Generators (Keep original distinct logic)
// ---------------------
// Some types are inherently surface/generative and might not map well to "Volume Pattern"
// But we can force them to Linear if pattern is Linear, or just ignore pattern if they are special.
// Let's allow pattern override for standard shapes, but Recliner/Lamp/Mobius retain their identity unless explicitly integrated.
// Actually, Voronoi Recliner IS the Recliner. Linear Recliner doesn't exist in previous code.
// So let's handle dispatch carefully.

function generateVoronoiReclinerOriginal(nodes: Vector3[], edges: [number, number][], params: FurnitureParams) {
  // ... Original implementation for "Recliner" type which is voronoi-based
  // We'll keep this as the "Linear" (default) implementation for Recliner because that's what it is.
  const { width, height, depth } = params;
  const p0 = new Vector3(0, height * 0.9, -depth/2);
  const p1 = new Vector3(0, height * 0.2, -depth/4);
  const p2 = new Vector3(0, height * 0.6, depth/4); 
  const p3 = new Vector3(0, height * 0.3, depth/2); 

  const densityU = 30; 
  const densityV = 12; 
  const surfacePoints: { id: number, vec: Vector3 }[] = [];

  for (let i = 0; i <= densityU; i++) {
    const t = i / densityU;
    const spineY = cubicBezierPoint(p0, p1, p2, p3, t).y;
    const spineZ = MathUtils.lerp(-depth/2, depth/2, t);
    const jitterZ = (Math.random() - 0.5) * (depth / densityU) * 0.8;
    for (let j = 0; j <= densityV; j++) {
      const u = j / densityV;
      const x = (u - 0.5) * width;
      const jitterX = (Math.random() - 0.5) * (width / densityV) * 0.8;
      const finalX = x + jitterX;
      const finalZ = spineZ + jitterZ;
      const cradle = Math.cos((u - 0.5) * Math.PI) * -0.1 * width; 
      const finalY = spineY + cradle;
      const idx = addNode(nodes, finalX, finalY, finalZ);
      surfacePoints.push({ id: idx, vec: nodes[idx] });
    }
  }
  const connectionDist = (width / densityV) * 1.8; 
  const windowSize = densityV * 3; 
  for (let i = 0; i < surfacePoints.length; i++) {
    const pA = surfacePoints[i];
    for (let j = i + 1; j < Math.min(i + windowSize, surfacePoints.length); j++) {
      const pB = surfacePoints[j];
      const dist = pA.vec.distanceTo(pB.vec);
      if (dist < connectionDist) link(edges, pA.id, pB.id);
    }
  }
  surfacePoints.forEach(p => {
    if (Math.random() > 0.97 && p.vec.y < height * 0.5) {
      const legId = addNode(nodes, p.vec.x, 0, p.vec.z);
      link(edges, p.id, legId);
    }
  });
}

// ---------------------
// Main Export
// ---------------------

export function generateFurniture(type: FurnitureType, params: FurnitureParams): NetworkData {
  const nodes: Vector3[] = [];
  const edges: [number, number][]= [];

  // Special Types handling
  // Recliner is inherently Voronoi-ish surface. Lamp is inherently Hyphae. Mobius is specific.
  // If user selects 'Gyroid' for these, we try to use the volume generator.
  // If user selects 'Linear', we use their special logic.
  
  const isVolumePattern = params.pattern === 'Gyroid' || params.pattern === 'Voronoi' || params.pattern === 'Triangular';
  
  if (isVolumePattern) {
      // Use generic volume generators
      if (params.pattern === 'Gyroid') {
          generateVolumeGyroid(nodes, edges, params, type);
      } else if (params.pattern === 'Triangular') {
          generateVolumeTriangular(nodes, edges, params, type);
      } else {
          generateVolumeVoronoi(nodes, edges, params, type);
      }
      return { nodes, edges };
  }

  // Linear / Default implementations
  if (type === 'Chair') generateLinearChair(nodes, edges, params);
  else if (type === 'Table') generateLinearTable(nodes, edges, params);
  else if (type === 'Stool') generateLinearStool(nodes, edges, params);
  else if (type === 'Recliner') generateVoronoiReclinerOriginal(nodes, edges, params);
  else if (type === 'Bench') {
      // Inline Linear Bench
      const { width, height, depth } = params;
      const w2 = width/2, d2 = depth/2;
      const legs = 3; 
      const dx = width / (legs - 1);
      for (let i = 0; i < legs; i++) {
        const x = -w2 + i * dx;
        const f_b = addNode(nodes, x, 0, d2);
        const b_b = addNode(nodes, x, 0, -d2);
        const f_t = addNode(nodes, x, height, d2);
        const b_t = addNode(nodes, x, height, -d2);
        link(edges, f_b, f_t);
        link(edges, b_b, b_t);
        link(edges, f_t, b_t); 
        if (i > 0) {
            const prev_f_t = nodes.length - 6; 
            const prev_b_t = nodes.length - 5;
            link(edges, prev_f_t, f_t); link(edges, prev_b_t, b_t);
            link(edges, prev_f_t, b_t); link(edges, prev_b_t, f_t);
        }
      }
  }
  else if (type === 'Shelf') {
    // Inline Linear Shelf
      const { width, height, depth } = params;
      const w2 = width/2, d2 = depth/2;
    const levels = 4;
    const dy = height / (levels - 1);
    for (let i = 0; i < levels; i++) {
      const y = i * dy;
      const fl = addNode(nodes, -w2, y, d2);
      const fr = addNode(nodes, w2, y, d2);
      const bl = addNode(nodes, -w2, y, -d2);
      const br = addNode(nodes, w2, y, -d2);
      link(edges, fl, fr); link(edges, fr, br);
      link(edges, br, bl); link(edges, bl, fl);
      link(edges, fl, br); link(edges, fr, bl);
      if (i > 0) {
        const prev_fl = nodes.length - 8;
        const prev_fr = nodes.length - 7;
        const prev_bl = nodes.length - 6;
        const prev_br = nodes.length - 5;
        link(edges, prev_fl, fl); link(edges, prev_fr, fr);
        link(edges, prev_bl, bl); link(edges, prev_br, br);
      }
    }
  }
  else if (type === 'Vase') {
      // Inline Linear Vase
      const { width, height } = params;
      const rings = 8;
    const segments = 6;
    const baseRadius = width * 0.4;
    let prevIndices: number[] = [];
    for (let r = 0; r < rings; r++) {
      const y = (r / (rings - 1)) * height;
      const bulge = Math.sin((r / (rings - 1)) * Math.PI) * 0.3;
      const rad = baseRadius + bulge + (r/rings)*0.1;
      const currentIndices: number[] = [];
      for (let s = 0; s < segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        const twist = r * 0.2;
        const nx = Math.cos(theta + twist) * rad;
        const nz = Math.sin(theta + twist) * rad;
        currentIndices.push(addNode(nodes, nx, y, nz));
      }
      for (let s = 0; s < segments; s++) {
        const nextS = (s + 1) % segments;
        link(edges, currentIndices[s], currentIndices[nextS]);
        if (r > 0) {
          link(edges, prevIndices[s], currentIndices[s]);
          link(edges, prevIndices[s], currentIndices[nextS]);
        }
      }
      prevIndices = currentIndices;
    }
  }
  // Fallbacks for Lamp, Mobius, etc to avoid breaking if not volume
  else if (type === 'Lamp') {
      // Re-implement Hyphae Lamp
      const { width, height } = params;
      const layers = 16;
      const radBase = width * 0.4;
      const radTop = width * 0.25;
      const pointsPerLayer = 9;
      let prevLayerIds: number[] = [];
      for (let i = 0; i <= layers; i++) {
        const t = i / layers;
        const y = t * height;
        const waist = 0.5;
        const profile = 1 - Math.sin(t * Math.PI) * waist; 
        const currentRad = MathUtils.lerp(radBase, radTop, t) * profile;
        const layerIds: number[] = [];
        for (let j = 0; j < pointsPerLayer; j++) {
            const angle = (j / pointsPerLayer) * Math.PI * 2;
            const noiseX = Math.sin(angle * 3 + t * 10) * 0.1 * width;
            const noiseZ = Math.cos(angle * 5 - t * 8) * 0.1 * width;
            const twist = t * Math.PI * 4;
            const x = Math.cos(angle + twist) * currentRad + noiseX;
            const z = Math.sin(angle + twist) * currentRad + noiseZ;
            layerIds.push(addNode(nodes, x, y, z));
        }
        if (i > 0) {
            for (let j = 0; j < pointsPerLayer; j++) {
                const curr = layerIds[j];
                const prev = prevLayerIds[j];
                const prevNext = prevLayerIds[(j + 1) % pointsPerLayer];
                link(edges, curr, prev);
                link(edges, curr, prevNext);
                link(edges, curr, layerIds[(j + 1) % pointsPerLayer]);
            }
        } else {
            for (let j = 0; j < pointsPerLayer; j++) {
                link(edges, layerIds[j], layerIds[(j + 1) % pointsPerLayer]);
            }
        }
        prevLayerIds = layerIds;
      }
  }
  else if (type === 'Mobius') {
      // Re-implement Mobius
      const { width, height, depth } = params;
      const R = width * 0.8;
      const segmentsT = 64; 
      const segmentsS = 4;
      const stripWidth = depth * 0.4; 
      const grid: number[][] = [];
      for (let i = 0; i < segmentsT; i++) {
        const t = (i / segmentsT) * Math.PI * 2;
        const row: number[] = [];
        for (let j = 0; j <= segmentsS; j++) {
            const sNormalized = (j / segmentsS) - 0.5; 
            const s = sNormalized * stripWidth;
            const mx = (R + s * Math.cos(t / 2)) * Math.cos(t);
            const my = (R + s * Math.cos(t / 2)) * Math.sin(t);
            const mz = s * Math.sin(t / 2);
            row.push(addNode(nodes, mx, mz + height/2, my * 0.6));
        }
        grid.push(row);
      }
      for (let i = 0; i < segmentsT; i++) {
        const nextI = (i + 1) % segmentsT;
        for (let j = 0; j <= segmentsS; j++) {
            const curr = grid[i][j];
            if (nextI === 0) {
                const nextJ = segmentsS - j;
                link(edges, curr, grid[0][nextJ]);
            } else {
                link(edges, curr, grid[nextI][j]);
            }
            if (j < segmentsS) {
                link(edges, curr, grid[i][j + 1]);
                if (nextI !== 0) link(edges, curr, grid[nextI][j+1]); 
            }
        }
      }
      nodes.forEach((n) => { if (n.y < 0) n.y = 0; });
  }

  return { nodes, edges };
}

// ---------------------
// Serpentine utilities (unchanged)
// ---------------------

export function safeUnit(v: Vector3, fallback = new Vector3(1, 0, 0)): Vector3 {
  const len = v.length();
  if (len < 1e-9) return fallback.clone();
  return v.clone().multiplyScalar(1 / len);
}

export function initialNormalFromTangent(t: Vector3): Vector3 {
  const tn = safeUnit(t);
  let up = new Vector3(0, 0, 1);
  if (Math.abs(tn.dot(up)) > 0.92) up.set(1, 0, 0);
  const n = new Vector3().crossVectors(tn, up);
  return safeUnit(n, new Vector3(0, 1, 0));
}

export function transportNormal(prevT: Vector3, currT: Vector3, prevN: Vector3): Vector3 {
  const a = safeUnit(prevT);
  const b = safeUnit(currT);
  const axis = new Vector3().crossVectors(a, b);
  const axisLen = axis.length();
  if (axisLen < 1e-9) return prevN.clone();
  axis.multiplyScalar(1 / axisLen);
  const dot = MathUtils.clamp(a.dot(b), -1, 1);
  const angle = Math.acos(dot);
  const q = new Quaternion().setFromAxisAngle(axis, angle);
  const n = prevN.clone().applyQuaternion(q);
  n.addScaledVector(b, -n.dot(b));
  return safeUnit(n, prevN);
}

export function cubicBezierPoint(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number): Vector3 {
  const it = 1 - t;
  const b0 = it * it * it;
  const b1 = 3 * it * it * t;
  const b2 = 3 * it * t * t;
  const b3 = t * t * t;
  return new Vector3(
    p0.x * b0 + p1.x * b1 + p2.x * b2 + p3.x * b3,
    p0.y * b0 + p1.y * b1 + p2.y * b2 + p3.y * b3,
    p0.z * b0 + p1.z * b1 + p2.z * b2 + p3.z * b3
  );
}

export function sampleBezier(p0: Vector3, h0: Vector3, h1: Vector3, p3: Vector3, samples: number): Vector3[] {
  const pts: Vector3[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    pts.push(cubicBezierPoint(p0, h0, h1, p3, t));
  }
  return pts;
}

export function serpentinize(
  points: Vector3[], 
  frequency: number, 
  amplitude: number,
  taperFraction: number = 0.15
): Vector3[] {
  if (points.length < 3) return points;

  const cum = [0];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += points[i + 1].distanceTo(points[i]);
    cum.push(total);
  }
  if (total < 1e-9) return points;

  let prevT = points[1].clone().sub(points[0]);
  let prevN = initialNormalFromTangent(prevT);

  const out: Vector3[] = [];
  
  for (let i = 0; i < points.length; i++) {
    let t: Vector3;
    if (i === 0) t = points[1].clone().sub(points[0]);
    else if (i === points.length - 1) t = points[points.length - 1].clone().sub(points[points.length - 2]);
    else t = points[i + 1].clone().sub(points[i - 1]);

    const n = transportNormal(prevT, t, prevN);

    // Normalized position along the curve [0, 1]
    const u = cum[i] / total;                 

    // Taper Envelope
    let envelope = 1.0;
    if (taperFraction > 0) {
        if (u < taperFraction) {
            envelope = u / taperFraction;
        } else if (u > 1 - taperFraction) {
            envelope = (1 - u) / taperFraction;
        }
        envelope = envelope * envelope * (3 - 2 * envelope);
    }

    const theta = (Math.PI * 2) * frequency * u;
    const disp = Math.sin(theta) * amplitude * envelope;

    out.push(points[i].clone().addScaledVector(n, disp));

    prevT = t;
    prevN = n;
  }

  return out;
}