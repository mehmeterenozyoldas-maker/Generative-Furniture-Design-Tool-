import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import GUI from 'lil-gui';
import { 
  generateFurniture,
  safeUnit, 
  sampleBezier, 
  serpentinize,
  type FurnitureType,
  type FurniturePattern
} from '../utils/geometry';

const SensingScene: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // ---------------------
    // Init Three.js
    // ---------------------
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.Fog(0x111111, 5, 20);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(4.0, 3.5, 4.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.5, 0);

    // ---------------------
    // Environment
    // ---------------------
    const gridHelper = new THREE.GridHelper(10, 20, 0x333333, 0x222222);
    scene.add(gridHelper);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(4, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0xffaa66, 0.4);
    backLight.position.set(-4, 3, -4);
    scene.add(backLight);

    // ---------------------
    // Materials
    // ---------------------
    const MAT_JOINT = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.7,
      metalness: 0.1,
    });

    const MAT_PRINT = new THREE.MeshStandardMaterial({
      color: 0xffa500, // Amber
      roughness: 0.4,
      metalness: 0.0,
      emissive: 0xaa4400,
      emissiveIntensity: 0.15,
    });
    
    // Core material (slightly darker/redder inside)
    const MAT_CORE = new THREE.MeshStandardMaterial({
      color: 0xcc6600,
      roughness: 0.5,
      metalness: 0.0,
    });

    const MAT_GHOST = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1,
      wireframe: false,
      depthTest: false,
      depthWrite: false
    });

    // ---------------------
    // Parameters & State
    // ---------------------
    const params = {
      type: 'Chair' as FurnitureType,
      pattern: 'Linear' as FurniturePattern,
      
      // Dimensions
      width: 0.6,
      height: 0.9,
      depth: 0.6,
      seatHeight: 0.45,

      // Fabrication Logic
      frequency: 15,
      amplitude: 0.04,
      thickness: 0.02,
      segments: 40,
      
      // New Connective Module
      structuralCore: true,
      coreThickness: 0.008, // 8mm core
      
      // Connection Logic
      taperLength: 0.2,
      
      // Style
      showGhost: false,
      
      // Stats
      filamentLength: 0,
      estWeight: 0,
      estCost: 0,
      
      // Actions
      exportSTL: () => {
        // Export Logic with Scale Correction
        const exporter = new STLExporter();
        const exportGroup = new THREE.Group();
        
        // --- ROBUST EXPORT LOGIC ---
        // 1. Iterate over all furniture children
        furnitureGroup.children.forEach(child => {
            // SKIP purely visual ghosts
            if (child.userData.isGhost) return;
            
            // HANDLE InstancedMesh (Joints)
            // STLExporter sometimes struggles with InstancedMesh depending on setup.
            // We bake instances into real meshes for the export group to be safe.
            if (child instanceof THREE.InstancedMesh) {
                const count = child.count;
                const tempMesh = new THREE.Mesh(child.geometry, child.material);
                const tempMatrix = new THREE.Matrix4();
                
                for(let i=0; i<count; i++) {
                    child.getMatrixAt(i, tempMatrix);
                    const instance = tempMesh.clone();
                    instance.applyMatrix4(tempMatrix);
                    // Apply parent transform if any (though furnitureGroup usually has identity)
                    instance.applyMatrix4(child.matrix); 
                    exportGroup.add(instance);
                }
            }
            // HANDLE Standard Meshes (Tubes, Cores)
            else if (child instanceof THREE.Mesh) {
                const c = child.clone();
                c.applyMatrix4(child.matrix);
                exportGroup.add(c);
            }
        });

        // Slicers work in mm. Threejs is usually m. 1m = 1000mm.
        exportGroup.scale.set(1000, 1000, 1000); 
        exportGroup.updateMatrixWorld(true);

        const result = exporter.parse(exportGroup);
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.style.display = 'none';
        document.body.appendChild(link);
        link.href = URL.createObjectURL(blob);
        link.download = `furniture_${params.type.toLowerCase()}_${params.pattern.toLowerCase()}_${Date.now()}.stl`;
        link.click();
        document.body.removeChild(link);
      }
    };

    const furnitureGroup = new THREE.Group();
    scene.add(furnitureGroup);
    
    const planeGeo = new THREE.PlaneGeometry(10, 10);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.001; 
    plane.receiveShadow = true;
    scene.add(plane);

    // ---------------------
    // Logic
    // ---------------------
    
    const dummy = new THREE.Object3D();
    
    const rebuild = () => {
      // 1. Cleanup
      furnitureGroup.traverse((o: any) => {
        if (o.isMesh || o.isInstancedMesh) {
          if (o.geometry) o.geometry.dispose();
        }
      });
      while (furnitureGroup.children.length) furnitureGroup.remove(furnitureGroup.children[0]);

      // 2. Generate Data
      const data = generateFurniture(params.type, {
        width: params.width,
        height: params.height,
        depth: params.depth,
        seatHeight: params.seatHeight,
        pattern: params.pattern
      });

      // 3. Build Joints
      const jointRadius = params.thickness * 1.6;
      const jointGeo = new THREE.SphereGeometry(jointRadius, 12, 12);
      
      const jointMesh = new THREE.InstancedMesh(jointGeo, MAT_JOINT, data.nodes.length);
      jointMesh.castShadow = true;
      jointMesh.receiveShadow = true;
      jointMesh.userData = { isGhost: false }; // Important: This is printable geometry
      
      data.nodes.forEach((pos, i) => {
        dummy.position.copy(pos);
        dummy.rotation.set(0,0,0);
        dummy.scale.set(1,1,1);
        dummy.updateMatrix();
        jointMesh.setMatrixAt(i, dummy.matrix);
      });
      jointMesh.instanceMatrix.needsUpdate = true;
      furnitureGroup.add(jointMesh);

      // 4. Build Struts
      let totalLen = 0;

      // Adjust frequency automatically for Gyroid/Voronoi density to look good
      let freqMultiplier = 1.5;
      if (params.pattern === 'Gyroid') freqMultiplier = 2.0;
      if (params.pattern === 'Voronoi') freqMultiplier = 1.0;
      if (params.pattern === 'Triangular') freqMultiplier = 0.8;
      
      // Reusable geometry for cores (unit cylinder Y-up)
      const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
      cylinderGeo.translate(0, 0.5, 0); // Pivot at bottom

      data.edges.forEach(([i, j]) => {
        const a = data.nodes[i];
        const b = data.nodes[j];
        const vec = b.clone().sub(a);
        const L = vec.length();
        if (L < 0.001) return;

        // --- Structural Core (Connective Module) ---
        // This is a solid rod replacing the ghost line for stability
        if (params.structuralCore) {
            const coreMesh = new THREE.Mesh(cylinderGeo, MAT_CORE);
            coreMesh.scale.set(params.coreThickness, L, params.coreThickness);
            coreMesh.position.copy(a);
            coreMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vec.clone().normalize());
            coreMesh.castShadow = true;
            coreMesh.receiveShadow = true;
            coreMesh.userData = { isGhost: false }; // Printable!
            furnitureGroup.add(coreMesh);
        }

        // --- Visual Ghost (Skeleton) ---
        // Only if requested, and marked as ghost so it doesn't export
        if (params.showGhost) {
          const ghostGeo = new THREE.CylinderGeometry(0.003, 0.003, L, 4);
          ghostGeo.rotateX(Math.PI/2); // Cylinder is Y up, rotate to Z for lookAt logic or just use quaternion
          const m = new THREE.Mesh(ghostGeo, MAT_GHOST);
          m.position.copy(a).addScaledVector(vec, 0.5);
          m.lookAt(b);
          m.userData = { isGhost: true }; // NOT Printable!
          furnitureGroup.add(m);
        }

        // --- Serpentine Tube ---
        const offset = jointRadius * 0.8; 
        const start = a.clone().addScaledVector(safeUnit(vec), offset);
        const end = b.clone().addScaledVector(safeUnit(vec), -offset);
        
        if (start.distanceTo(end) <= 0.01) return;

        const basePts = sampleBezier(start, start.clone().lerp(end, 0.33), start.clone().lerp(end, 0.66), end, params.segments);
        const freq = params.frequency * (L * freqMultiplier); 
        const serpPts = serpentinize(basePts, freq, params.amplitude, params.taperLength);

        for(let k=0; k<serpPts.length-1; k++) {
            totalLen += serpPts[k].distanceTo(serpPts[k+1]);
        }

        const curve = new THREE.CatmullRomCurve3(serpPts);
        const tubeGeo = new THREE.TubeGeometry(curve, params.segments, params.thickness, 6, false);
        const tubeMesh = new THREE.Mesh(tubeGeo, MAT_PRINT);
        tubeMesh.castShadow = true;
        tubeMesh.receiveShadow = true;
        tubeMesh.userData = { isGhost: false }; // Printable!
        furnitureGroup.add(tubeMesh);
      });

      // 5. Update Stats
      const radiusM = params.thickness; 
      const volumeM3 = totalLen * Math.PI * (radiusM * radiusM);
      const volumeCm3 = volumeM3 * 1000000;
      const weightG = volumeCm3 * 1.24; 
      const cost = (weightG / 1000) * 20.0;

      params.filamentLength = parseFloat(totalLen.toFixed(2));
      params.estWeight = parseFloat(weightG.toFixed(1));
      params.estCost = parseFloat(cost.toFixed(2));
    };

    rebuild();

    // ---------------------
    // GUI
    // ---------------------
    const gui = new GUI({ width: 340, container: containerRef.current });
    gui.domElement.style.position = 'absolute';
    gui.domElement.style.top = '10px';
    gui.domElement.style.right = '10px';

    gui.add(params, 'type', [
        'Chair', 'Table', 'Stool', 'Bench', 'Shelf', 'Vase',
        'Recliner', 'Lamp', 'Mobius'
    ]).name('Object Type').onChange(rebuild);

    gui.add(params, 'pattern', ['Linear', 'Triangular', 'Gyroid', 'Voronoi'])
       .name('Structure Pattern')
       .onChange(rebuild);
    
    const fDim = gui.addFolder('Parametric Dimensions');
    fDim.add(params, 'width', 0.2, 3.0).name('Width / Scale X').onChange(rebuild);
    fDim.add(params, 'height', 0.2, 3.0).name('Height / Scale Y').onChange(rebuild);
    fDim.add(params, 'depth', 0.2, 3.0).name('Depth / Scale Z').onChange(rebuild);
    fDim.add(params, 'seatHeight', 0.1, 1.2).name('Offset / Seat H').onChange(rebuild);

    const fDesign = gui.addFolder('Fabrication Logic');
    fDesign.add(params, 'structuralCore').name('Reinforce Core').onChange(rebuild);
    fDesign.add(params, 'coreThickness', 0.002, 0.02).name('Core Thickness').onChange(rebuild);
    fDesign.add(params, 'frequency', 1, 40).name('Wave Density').onChange(rebuild);
    fDesign.add(params, 'amplitude', 0.0, 0.15).name('Wave Amplitude').onChange(rebuild);
    fDesign.add(params, 'taperLength', 0.0, 0.5).name('Joint Snapping').onChange(rebuild);
    fDesign.add(params, 'thickness', 0.005, 0.05).name('Strut Radius').onChange(rebuild);
    fDesign.add(params, 'segments', 10, 100).step(1).name('Smoothness').onChange(rebuild);
    
    const fStats = gui.addFolder('Fabrication Data (PLA)');
    fStats.add(params, 'filamentLength').name('Path Length (m)').listen().disable();
    fStats.add(params, 'estWeight').name('Weight (g)').listen().disable();
    fStats.add(params, 'estCost').name('Est Cost ($)').listen().disable();
    fStats.open();

    gui.add(params, 'showGhost').name('Show Skeleton Lines').onChange(rebuild);
    gui.add(params, 'exportSTL').name('⬇ Export STL (mm)');

    // ---------------------
    // Loop
    // ---------------------
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animId);
      gui.destroy();
      renderer.dispose();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full relative" />;
};

export default SensingScene;