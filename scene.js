// ═══════════════════════════════════════════════════
// MAFIA PROTOCOL — scene.js  (Three.js environments)
// ═══════════════════════════════════════════════════
/* global THREE */

const BGScene = (() => {
  let scene, cam, renderer, clock;
  let particles = [], meshes = [], raf;
  let currentTheme = null;

  // ── THEMES ──────────────────────────────────────
  const THEMES = {
    menu: {
      bg: 0x030108,
      layers: [
        { color: 0x8b1010, count: 600, size: 0.038, speed: 0.007, spread: 20, drift: 0.004, vortex: true },
        { color: 0x3a0000, count: 250, size: 0.07, speed: 0.003, spread: 15, drift: 0.002, vortex: true },
        { color: 0xc9932a, count: 100, size: 0.05, speed: 0.004, spread: 18, drift: 0.006, rise: true }
      ],
      fog: { color: 0x030108, near: 14, far: 32 }
    },

    // ── Role reveal themes ──────────────────────────
    Mafia: {
      bg: 0x050002,
      layers: [
        { color: 0xff1111, count: 800, size: 0.048, speed: 0.028, spread: 18, drift: 0.009, vortex: true },
        { color: 0x880000, count: 350, size: 0.09, speed: 0.012, spread: 13, drift: 0.005, vortex: true },
        { color: 0x330000, count: 150, size: 0.18, speed: 0.005, spread: 10, drift: 0.002 }
      ],
      fog: { color: 0x1a0000, near: 7, far: 20 }
    },
    Doctor: {
      bg: 0x010a08,
      layers: [
        { color: 0x00ff88, count: 500, size: 0.055, speed: 0.007, spread: 16, drift: 0.014, rise: true },
        { color: 0x00cc66, count: 220, size: 0.038, speed: 0.004, spread: 12, drift: 0.009, rise: true },
        { color: 0x004422, count: 100, size: 0.12, speed: 0.002, spread: 10, drift: 0.005, rise: true }
      ],
      fog: { color: 0x010a07, near: 12, far: 28 }
    },
    Detective: {
      bg: 0x010308,
      layers: [
        { color: 0x4488ff, count: 600, size: 0.038, speed: 0.01, spread: 18, drift: 0.007, grid: true },
        { color: 0x2255cc, count: 220, size: 0.065, speed: 0.005, spread: 13, drift: 0.003 },
        { color: 0x001144, count: 100, size: 0.14, speed: 0.002, spread: 10, drift: 0.001 }
      ],
      fog: { color: 0x010210, near: 10, far: 24 }
    },
    Villager: {
      bg: 0x050508,
      layers: [
        { color: 0xc8b880, count: 350, size: 0.032, speed: 0.004, spread: 20, drift: 0.006 },
        { color: 0x888860, count: 180, size: 0.055, speed: 0.002, spread: 15, drift: 0.003 },
        { color: 0x444430, count: 80, size: 0.11, speed: 0.001, spread: 12, drift: 0.001 }
      ],
      fog: { color: 0x050508, near: 16, far: 36 }
    },

    // ── Phase ambient themes ────────────────────────
    night_mafia: {
      bg: 0x060002,
      layers: [
        { color: 0xcc1100, count: 700, size: 0.042, speed: 0.022, spread: 18, drift: 0.007, vortex: true },
        { color: 0x550000, count: 280, size: 0.085, speed: 0.009, spread: 13, drift: 0.003, vortex: true },
        { color: 0xc9932a, count: 60, size: 0.06, speed: 0.003, spread: 20, drift: 0.004 }
      ],
      fog: { color: 0x150000, near: 8, far: 20 }
    },
    night_doc: {
      bg: 0x010908,
      layers: [
        { color: 0x00dd77, count: 420, size: 0.050, speed: 0.006, spread: 15, drift: 0.012, rise: true },
        { color: 0x004433, count: 160, size: 0.09, speed: 0.003, spread: 11, drift: 0.007, rise: true },
        { color: 0x00ff88, count: 80, size: 0.022, speed: 0.008, spread: 18, drift: 0.016, rise: true }
      ],
      fog: { color: 0x010a07, near: 12, far: 28 }
    },
    night_cop: {
      bg: 0x010308,
      layers: [
        { color: 0x3377ff, count: 520, size: 0.038, speed: 0.009, spread: 17, drift: 0.005, grid: true },
        { color: 0x1133aa, count: 190, size: 0.075, speed: 0.004, spread: 12, drift: 0.003 },
        { color: 0x88aaff, count: 80, size: 0.022, speed: 0.012, spread: 20, drift: 0.008 }
      ],
      fog: { color: 0x010210, near: 10, far: 24 }
    },
    dawn: {
      bg: 0x0c0702,
      layers: [
        { color: 0xf59e0b, count: 480, size: 0.048, speed: 0.006, spread: 16, drift: 0.009, rise: true },
        { color: 0xfbbf24, count: 220, size: 0.075, speed: 0.004, spread: 13, drift: 0.006, rise: true },
        { color: 0xff6600, count: 120, size: 0.035, speed: 0.008, spread: 18, drift: 0.012, rise: true },
        { color: 0x7c3a00, count: 80, size: 0.14, speed: 0.002, spread: 10, drift: 0.003 }
      ],
      fog: { color: 0x0a0602, near: 13, far: 30 }
    },
    discuss: {
      bg: 0x050508,
      layers: [
        { color: 0xd4b480, count: 360, size: 0.032, speed: 0.004, spread: 20, drift: 0.007 },
        { color: 0x998850, count: 180, size: 0.065, speed: 0.002, spread: 15, drift: 0.004 },
        { color: 0x554430, count: 90, size: 0.11, speed: 0.001, spread: 12, drift: 0.002 }
      ],
      fog: { color: 0x060605, near: 15, far: 35 }
    }
  };

  // ── PARTICLE LAYER ───────────────────────────────
  function makeLayer(cfg) {
    const geo = new THREE.BufferGeometry();
    const n = cfg.count;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3); // dx, dy, phase

    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * cfg.spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * cfg.spread;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 9;
      vel[i * 3] = (Math.random() - 0.5) * 2;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 2;
      vel[i * 3 + 2] = Math.random() * Math.PI * 2; // phase offset
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    geo._vel = vel;
    geo._cfg = cfg;
    geo._orig = pos.slice();

    const mat = new THREE.PointsMaterial({
      color: cfg.color, size: cfg.size,
      transparent: true, opacity: 0.72,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    return new THREE.Points(geo, mat);
  }

  // ── GRID MESH (Detective / Cop phases) ──────────
  function makeGrid(color) {
    const geo = new THREE.BufferGeometry();
    const verts = [];
    const s = 22, step = 1.6;
    for (let x = -s; x <= s; x += step) { verts.push(x, -s, -5, x, s, -5); }
    for (let y = -s; y <= s; y += step) { verts.push(-s, y, -5, s, y, -5); }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.05 });
    return new THREE.LineSegments(geo, mat);
  }

  // ── CANDLE FLICKER LIGHTS (ambient mood meshes) ──
  function makeGlow(color, x, y) {
    const geo = new THREE.SphereGeometry(0.3, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, -3);
    mesh._isGlow = true;
    mesh._baseOpacity = 0.28 + Math.random() * 0.18;
    mesh._flickerPhase = Math.random() * Math.PI * 2;
    return mesh;
  }

  // ── INIT ─────────────────────────────────────────
  function init() {
    if (renderer) return;
    const canvas = document.getElementById('bg-canvas');
    if (!canvas || !window.THREE) return;

    renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: false, powerPreference: 'low-power'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
    clock = new THREE.Clock();
    cam.position.z = 8;

    window.addEventListener('resize', () => {
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    setTheme('menu');
    loop();
  }

  // ── SET THEME ────────────────────────────────────
  function setTheme(name) {
    if (!renderer) return;
    const t = THEMES[name] || THEMES.menu;
    if (currentTheme === name) return;
    currentTheme = name;

    // Clear old objects
    particles.forEach(p => scene.remove(p));
    meshes.forEach(m => scene.remove(m));
    particles = []; meshes = [];

    renderer.setClearColor(t.bg, 1);
    if (t.fog) scene.fog = new THREE.Fog(t.fog.color, t.fog.near, t.fog.far);
    else scene.fog = null;

    // Grid for Detective phases
    if (name === 'Detective' || name === 'night_cop') {
      const g = makeGrid(name === 'Detective' ? 0x3366ff : 0x2244cc);
      scene.add(g); meshes.push(g);
    }

    // Ambient glow spheres for warm phases
    if (name === 'dawn' || name === 'discuss' || name === 'menu') {
      const glowColor = name === 'dawn' ? 0xf59e0b : name === 'discuss' ? 0xc9932a : 0x8b1010;
      const positions = [[-6, -4], [-7, 3], [6, -3], [7, 4], [0, -6]];
      positions.forEach(([x, y]) => {
        const g = makeGlow(glowColor, x, y);
        scene.add(g); meshes.push(g);
      });
    }

    // Particle layers
    t.layers.forEach(cfg => {
      const pts = makeLayer(cfg);
      scene.add(pts);
      particles.push(pts);
    });
  }

  // ── ANIMATION LOOP ───────────────────────────────
  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    particles.forEach(pts => {
      if (!pts.geometry) return;
      const pos = pts.geometry.attributes.position.array;
      const vel = pts.geometry._vel;
      const cfg = pts.geometry._cfg;
      const s = pos.length / 3;

      for (let i = 0; i < s; i++) {
        const px = i * 3, py = i * 3 + 1;
        const vx = vel[i * 3], vy = vel[i * 3 + 1], ph = vel[i * 3 + 2];

        if (cfg.vortex) {
          const cx = pos[px], cy = pos[py];
          const dist = Math.sqrt(cx * cx + cy * cy) || 0.01;
          pos[px] += (-cy / dist) * cfg.speed + vx * 0.003;
          pos[py] += (cx / dist) * cfg.speed + vy * 0.003;
        } else if (cfg.rise) {
          pos[py] += cfg.speed + Math.sin(t + ph) * 0.003;
          pos[px] += Math.sin(t * 0.5 + ph) * cfg.drift;
        } else {
          pos[px] += Math.sin(t * 0.3 + ph) * cfg.drift;
          pos[py] += Math.sin(t * 0.2 + ph + 1.57) * cfg.drift;
        }

        // Wrap bounds
        const b = cfg.spread * 0.6;
        if (pos[px] > b) pos[px] = -b;
        if (pos[px] < -b) pos[px] = b;
        if (pos[py] > b) pos[py] = -b;
        if (pos[py] < -b) pos[py] = b;
      }
      pts.geometry.attributes.position.needsUpdate = true;

      if (cfg.vortex) pts.rotation.z += cfg.speed * 0.08 * dt;
    });

    // Grid pulse and glow flicker
    meshes.forEach(m => {
      if (!m.material) return;
      if (m._isGlow) {
        // Candle flicker
        const flicker = 0.7 + 0.3 * Math.sin(t * 3.5 + m._flickerPhase) +
          0.12 * Math.sin(t * 11 + m._flickerPhase * 2);
        m.material.opacity = m._baseOpacity * flicker;
        m.position.y += Math.sin(t * 1.2 + m._flickerPhase) * 0.0015;
      } else {
        // Grid scanline opacity pulse
        m.material.opacity = 0.04 + Math.sin(t * 0.8) * 0.022;
      }
    });

    renderer.render(scene, cam);
  }

  return { init, setTheme };
})();
