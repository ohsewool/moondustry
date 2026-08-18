// 문더스트리 봇 플레이어 — 실제 브라우저에서 20웨이브 플레이 시도
const { chromium } = require('playwright');
const SHOT = n => `${__dirname}/shot-${n}.png`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(process.env.GAME_URL || 'file://' + require('path').resolve(__dirname, '../public/index.html'));
  await page.screenshot({ path: SHOT('0-title') });
  await page.click('#startbtn');
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT('1-start') });

  // ── 월드 스냅샷 ──
  const world = await page.evaluate(() => ({
    MW, MH,
    core: { x: core.x, y: core.y },
    spawns,
    paths: paths.map(p => p.map(q => ({ x: Math.floor(q.x / 24), y: Math.floor(q.y / 24) }))),
  }));
  const getMap = () => page.evaluate(() =>
    map.map(row => row.map(t => ({ r: t.rock ? 1 : 0, o: t.ore === 'c' ? 1 : (t.ore ? 2 : 0), b: t.b ? t.b.type : null }))));
  // o: 0=없음 1=구리 2=티타늄 — 봇은 구리(1)만 드릴 대상으로 사용 (티타늄 탄약은 포탑에 안 들어감)
  const getState = () => page.evaluate(() => ({
    copper: Math.floor(copper), wave, inWave, coreHp: Math.ceil(core.hp), gameOver,
    enemies: enemies.length,
    epos: enemies.slice(0, 10).map(e => ({ x: Math.floor(e.x / 24), y: Math.floor(e.y / 24) })),
    builds: builds.filter(b => b.type !== 'core').map(b => ({ t: b.type, x: b.x, y: b.y, ammo: b.ammo })),
    noAmmo: builds.filter(b => TURRETS.has(b.type) && b.ammo <= 0).length,
  }));
  const placeAt = (type, x, y, dir) => page.evaluate(([t, x, y, d]) => {
    if (d !== null) ghostRot = d;
    const before = builds.length;
    place(t, x, y);
    return builds.length > before;
  }, [type, x, y, dir === undefined ? null : dir]);

  const inB = (x, y) => x >= 0 && y >= 0 && x < world.MW && y < world.MH;
  const coreTiles = [];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) coreTiles.push({ x: world.core.x + dx, y: world.core.y + dy });
  const isCoreAdj = (x, y) => coreTiles.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) === 1);
  const dirTo = (a, b) => b.x > a.x ? 0 : (b.y > a.y ? 1 : (b.x < a.x ? 2 : 3));
  const nearSpawn = (x, y) => world.spawns.some(s => (s.x - x) ** 2 + (s.y - y) ** 2 < 5.5 * 5.5);

  // 경로 타일 집합 (병목 = 여러 스폰 경로가 겹치는 곳)
  const pathTiles = new Set(), overlap = new Map();
  for (const p of world.paths) {
    const seen = new Set();
    for (const q of p) {
      const k = q.x + ',' + q.y;
      pathTiles.add(k);
      if (!seen.has(k)) { overlap.set(k, (overlap.get(k) || 0) + 1); seen.add(k); }
    }
  }
  const nearPath = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (pathTiles.has((x + dx) + ',' + (y + dy))) return true;
    return false;
  };

  // BFS로 벨트 경로 찾기 (빈 바닥만 통과)
  function beltRoute(m, from, isGoal) {
    const prev = new Map(), q = [from], seenB = new Set([from.x + ',' + from.y]);
    while (q.length) {
      const c = q.shift();
      if (isGoal(c.x, c.y)) {
        const path = [c];
        let k = c.x + ',' + c.y;
        while (prev.has(k)) { path.unshift(prev.get(k)); k = path[0].x + ',' + path[0].y; }
        return path;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = c.x + dx, ny = c.y + dy, k = nx + ',' + ny;
        if (!inB(nx, ny) || seenB.has(k)) continue;
        const t = m[ny][nx];
        if (t.r || t.b || nearSpawn(nx, ny)) { if (!isGoal(nx, ny)) continue; }
        seenB.add(k); prev.set(k, c); q.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  const ccx2 = world.core.x + 1, ccy2 = world.core.y + 1;
  const wallPlan = new Set(); // 코어 반경 4.3~5.6의 모든 바닥 타일 = 완전 봉쇄선
  { const m0 = await getMap();
    for (let y = 0; y < world.MH; y++) for (let x = 0; x < world.MW; x++) {
      const d = Math.hypot(x - ccx2, y - ccy2);
      if (d < 4.3 || d > 5.6) continue;
      if (!m0[y][x].r && !m0[y][x].o) wallPlan.add(x + ',' + y);
    }
  }
  async function ensureFortress(m) {
    let put = 0;
    for (const k of wallPlan) {
      if (put >= 2) break;
      const [x, y] = k.split(',').map(Number);
      if (!inB(x, y) || m[y][x].r || m[y][x].b || m[y][x].o) continue;
      if (await placeAt('wall', x, y)) put++;
    }
    return put;
  }

  const log = [];
  let econChains = 0, clusters = 0, screenshots = new Set();

  // 경제 체인: 광석 → 드릴 → 벨트 → 코어
  async function buildEcon(m) {
    let best = null, bd = 1e9;
    for (let y = 0; y < world.MH; y++) for (let x = 0; x < world.MW; x++) {
      const t = m[y][x];
      if (t.o !== 1 || t.b || t.r || nearSpawn(x, y)) continue;
      const d = (x - world.core.x) ** 2 + (y - world.core.y) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (!best) return false;
    const route = beltRoute(m, best, isCoreAdj);
    if (!route || route.length < 2) return false;
    const st = await getState();
    if (st.copper < 50 + (route.length - 1) * 5 + 10) return false;
    if (!await placeAt('drill', best.x, best.y)) return false;
    for (let i = 1; i < route.length; i++) {
      const next = i + 1 < route.length ? route[i + 1] :
        coreTiles.reduce((a, c) => (Math.abs(c.x - route[i].x) + Math.abs(c.y - route[i].y) === 1 ? c : a), route[i]);
      await placeAt('conveyor', route[i].x, route[i].y, dirTo(route[i], next));
    }
    econChains++;
    log.push(`[건설] 경제 체인 #${econChains}: 드릴(${best.x},${best.y}) + 벨트 ${route.length - 1}칸`);
    return true;
  }

  // 방어 클러스터: 경로 근처 광석에 드릴 + 인접 포탑 (드릴이 직접 탄약 공급)
  async function buildCluster(m, turretType, coreGuard) {
    let best = null, bestScore = -Infinity;
    for (let y = 0; y < world.MH; y++) for (let x = 0; x < world.MW; x++) {
      const t = m[y][x];
      if (t.o !== 1 || t.b || t.r || nearSpawn(x, y)) continue;
      if (!coreGuard && !nearPath(x, y, 3)) continue;
      let free = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (inB(x + dx, y + dy) && !m[y + dy][x + dx].r && !m[y + dy][x + dx].b && !nearSpawn(x + dx, y + dy)) free++;
      const ov = overlap.get(x + ',' + y) || 0;
      const dCore = Math.hypot(x - world.core.x, y - world.core.y);
      const score = coreGuard ? free * 0.5 + ov - dCore * 1.5 : free + ov * 3 - dCore * 0.15;
      if (free >= 2 && score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (!best) return false;
    if (!await placeAt('drill', best.x, best.y)) return false;
    let placedTurrets = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (placedTurrets >= 2) break;
      const nx = best.x + dx, ny = best.y + dy;
      if (inB(nx, ny) && !m[ny][nx].r && !m[ny][nx].b && !nearSpawn(nx, ny))
        if (await placeAt(turretType, nx, ny)) placedTurrets++;
    }
    // 방패벽: 포탑 앞(경로 쪽)에 벽
    let nearestPathTile = null, npd = 1e9;
    for (const k of pathTiles) {
      const [px, py] = k.split(',').map(Number);
      const d = (px - best.x) ** 2 + (py - best.y) ** 2;
      if (d < npd) { npd = d; nearestPathTile = { x: px, y: py }; }
    }
    if (nearestPathTile) {
      const vx = Math.sign(nearestPathTile.x - best.x), vy = Math.sign(nearestPathTile.y - best.y);
      let wallsPut = 0;
      for (const [ox, oy] of [[vx, vy], [vx + (vy === 0 ? 0 : vx === 0 ? 1 : 0), vy + (vx === 0 ? 0 : vy === 0 ? 1 : 0)], [vx * 2, vy * 2], [vx * 2 + (vy === 0 ? 1 : 0), vy * 2 + (vx === 0 ? 1 : 0)], [vx * 2 - (vy === 0 ? 1 : 0), vy * 2 - (vx === 0 ? 1 : 0)]]) {
        if (wallsPut >= 3) break;
        if (await placeAt('wall', best.x + ox, best.y + oy)) wallsPut++;
      }
    }
    let extraDrill = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (extraDrill) break;
      const nx = best.x + dx, ny = best.y + dy;
      if (inB(nx, ny) && m[ny][nx].o === 1 && !m[ny][nx].b && !m[ny][nx].r)
        if (await placeAt('drill', nx, ny)) extraDrill++;
    }
    clusters++;
    log.push(`[건설] 방어 클러스터 #${clusters}: 드릴×${1 + extraDrill}(${best.x},${best.y}) + ${turretType}×${placedTurrets}`);
    return placedTurrets > 0;
  }

  async function buildFedTurret(m, tx, ty, type) {
    let spot = null;
    for (let r = 0; r <= 2 && !spot; r++)
      for (let y = ty - r; y <= ty + r && !spot; y++)
        for (let x = tx - r; x <= tx + r && !spot; x++)
          if (inB(x, y) && !m[y][x].r && !m[y][x].b && !m[y][x].o && !nearSpawn(x, y)) spot = { x, y };
    if (!spot) return false;
    let ore = null, bd = 1e9;
    for (let y = 0; y < world.MH; y++) for (let x = 0; x < world.MW; x++) {
      const t = m[y][x];
      if (t.o !== 1 || t.b || t.r || nearSpawn(x, y)) continue;
      const d = (x - spot.x) ** 2 + (y - spot.y) ** 2;
      if (d < bd) { bd = d; ore = { x, y }; }
    }
    if (!ore) return false;
    const isGoal = (x, y) => Math.abs(x - spot.x) + Math.abs(y - spot.y) === 1;
    const route = bd <= 2 ? [ore] : beltRoute(m, ore, isGoal);
    if (!route) return false;
    if (!await placeAt(type, spot.x, spot.y)) return false;
    if (!await placeAt('drill', ore.x, ore.y)) return true;
    for (let i = 1; i < route.length; i++) {
      const next = i + 1 < route.length ? route[i + 1] : spot;
      await placeAt('conveyor', route[i].x, route[i].y, dirTo(route[i], next));
    }
    log.push(`[증원] ${type}(${spot.x},${spot.y}) + 전용 드릴(${ore.x},${ore.y}) 벨트 ${route.length - 1}칸`);
    return true;
  }

  let menders = 0;
  async function buildMender(m, st) {
    const drills = st.builds.filter(b => b.t === 'drill');
    for (const d of drills) {
      const nearTurret = st.builds.some(b => ['duo','scatter','lancer'].includes(b.t)
        && Math.abs(b.x - d.x) <= 2 && Math.abs(b.y - d.y) <= 2);
      if (!nearTurret) continue;
      const hasMender = st.builds.some(b => b.t === 'mender'
        && Math.abs(b.x - d.x) <= 3 && Math.abs(b.y - d.y) <= 3);
      if (hasMender) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (await placeAt('mender', d.x + dx, d.y + dy)) {
          menders++; log.push(`[건설] 멘더(${d.x + dx},${d.y + dy}) — 드릴 자동 공급`);
          return true;
        }
    }
    return false;
  }

  await page.evaluate(() => { speedMul = 4; });

  // ── 메인 플레이 루프 ──
  const t0 = Date.now();
  let lastWave = 0, emerSpent = 0, lastCoreHp = 2600, reinforced = 0;
  while (Date.now() - t0 < 480000) {
    const st = await getState();
    if (st.gameOver) break;
    if (st.wave !== lastWave) {
      log.push(`── 웨이브 ${st.wave} 시작 · 코어 ${st.coreHp} · 자금 ${st.copper} · 포탑 ${st.builds.filter(b => ['duo', 'scatter', 'lancer'].includes(b.t)).length} · 경제 ${econChains}`);
      lastWave = st.wave; emerSpent = 0; reinforced = 0;
    }
    for (const w of [1, 5, 10, 15, 20]) {
      if (st.wave >= w && !screenshots.has(w)) {
        screenshots.add(w);
        await page.screenshot({ path: SHOT(`wave${w}`) });
      }
    }
    const m = await getMap();
    // 코어가 깎이는 중 → 누수 지점에 증원 (웨이브당 2회)
    if (st.coreHp < lastCoreHp && st.epos.length && reinforced < 2 && st.copper > 130) {
      const near = st.epos.filter(e => Math.abs(e.x - world.core.x) < 8 && Math.abs(e.y - world.core.y) < 8);
      if (near.length) {
        const lx = Math.round(near.reduce((a, e) => a + e.x, 0) / near.length);
        const ly = Math.round(near.reduce((a, e) => a + e.y, 0) / near.length);
        if (await buildFedTurret(m, lx, ly, st.copper > 350 ? 'scatter' : 'duo')) { reinforced++; lastCoreHp = st.coreHp; continue; }
      }
    }
    lastCoreHp = st.coreHp;
    // 긴급: 적이 코어 7칸 안 → 코어 옆에 판단 없이 듀오 증설
    const danger = st.epos.some(e => Math.abs(e.x - world.core.x) <= 5 && Math.abs(e.y - world.core.y) <= 5);
    if (danger && st.copper >= 45 && emerSpent < 2) {
      const drills = st.builds.filter(b => b.t === 'drill');
      let put = 0;
      for (const d of drills) {
        if (put >= 1) break;
        if (Math.abs(d.x - world.core.x) > 9 || Math.abs(d.y - world.core.y) > 9) continue;
        const adjTurrets = st.builds.filter(b => ['duo','scatter','lancer'].includes(b.t)
          && Math.abs(b.x - d.x) + Math.abs(b.y - d.y) === 1).length;
        if (adjTurrets >= 2) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (put >= 1) break;
          if (await placeAt('duo', d.x + dx, d.y + dy)) put++;
        }
      }
      if (put) { emerSpent++; log.push(`[긴급] 드릴 인접 듀오 증설`); continue; }
    }
    if (clusters < 1 && st.copper > 125 && await buildCluster(m, 'duo', true)) continue;
    if (econChains < 1 && st.copper > 110 && await buildEcon(m)) continue;
    if (econChains < 2 && st.copper > 115 && await buildEcon(m)) continue;
    if (clusters < 2 && st.copper > 140 && await buildCluster(m, 'duo', true)) continue;
    if (econChains < 3 && st.copper > 150 && await buildEcon(m)) continue;
    const targetClusters = Math.min(7, 2 + Math.floor(st.wave / 3) + 1);
    if (clusters < targetClusters && st.copper > 180 &&
        await buildCluster(m, st.copper > 300 && clusters >= 3 ? 'scatter' : 'duo', clusters < 3)) continue;
    // 여유 자금 → 포탑 강화 (뽕맛 검증)
    if (st.copper > 450) {
      const upped = await page.evaluate(() => {
        for (const b of builds)
          if (TURRETS.has(b.type) && (b.tier || 1) < 3 && copper >= upCost(b)) { doUpgrade(b); return `${b.type}(${b.x},${b.y})→T${b.tier}`; }
        return null;
      });
      if (upped) { log.push(`[강화] ${upped}`); continue; }
    }
    if (st.copper > 280 && menders < clusters && await buildMender(m, st)) continue;
    if (econChains < 4 && st.copper > 260 && await buildEcon(m)) continue;
    // 랜서는 전력 필요 — 봇은 전력 인프라를 안 지으므로 무전력 스캐터로 증원
    if (st.copper > 600 && await buildFedTurret(m, world.core.x - 3, world.core.y + Math.floor(Math.random() * 6) - 3, 'scatter')) continue;
    // 준비됐으면 웨이브 조기 소환
    const nTurrets = st.builds.filter(b => ['duo','scatter','lancer'].includes(b.t)).length;
    if (!st.inWave && st.noAmmo === 0 && nTurrets >= 3 && st.copper > 60)
      await page.evaluate(() => { if (!inWave) { copper += 15; startWave(); } });
    await page.waitForTimeout(500);
  }

  const fin = await getState();
  await page.screenshot({ path: SHOT('final') });
  log.push(`═══ 종료: 웨이브 ${fin.wave} · 코어 ${fin.coreHp} · 처치 ${await page.evaluate(() => kills)} · ${fin.gameOver ? (fin.coreHp > 0 ? '승리!' : '패배') : '시간 초과'}`);
  console.log(log.join('\n'));
  console.log(JSON.stringify({ final: fin, econChains, clusters, mins: ((Date.now() - t0) / 60000).toFixed(1) }));
  await browser.close();
})().catch(e => { console.error('BOT ERROR:', e.message); process.exit(1); });
