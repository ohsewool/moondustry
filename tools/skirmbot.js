// 스커미시 봇: 경제 → 방어 → 병영 2 → (가능하면) 합금 급이 → 집결 진군
// 목적: "성실한 기본 플레이"가 AI를 이길 수 있는지 밸런스 검증
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(process.env.GAME_URL || 'file://' + require('path').resolve(__dirname, '../public/index.html'));
  await page.click('#skirmishbtn');
  await page.waitForTimeout(300);
  await page.evaluate(() => { speedMul = 4; });

  // 게임 내 헬퍼 주입
  await page.evaluate(() => {
    window.BOT = {};
    BOT.P = (t, x, y, d) => { if (d !== undefined) ghostRot = d; if (canPlace(t, x, y) && copper >= DEFS[t].cost) { place(t, x, y); return true; } return false; };
    BOT.belt = (from, goal) => {
      const prev = new Map(), q = [from], seen = new Set([from.x + ',' + from.y]);
      while (q.length) {
        const c = q.shift();
        if (goal(c.x, c.y)) { const path = [c]; let k = c.x + ',' + c.y; while (prev.has(k)) { path.unshift(prev.get(k)); k = path[0].x + ',' + path[0].y; } return path; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = c.x + dx, ny = c.y + dy, k = nx + ',' + ny;
          if (!inMap(nx, ny) || seen.has(k)) continue;
          const t = map[ny][nx];
          if ((t.rock || t.b) && !goal(nx, ny)) continue;
          seen.add(k); prev.set(k, c); q.push({ x: nx, y: ny });
        }
      }
      return null;
    };
    BOT.dirTo = (a, b) => b.x > a.x ? 0 : (b.y > a.y ? 1 : (b.x < a.x ? 2 : 3));
    BOT.oreNear = (kind, tx, ty) => {
      let best = null, bd = 1e9;
      for (let y = 0; y < MH; y++) for (let x = 0; x < Math.floor(MW / 2) + 4; x++) {
        const t = map[y][x];
        if (t.ore !== kind || t.b || t.rock) continue;
        const d = (x - tx) ** 2 + (y - ty) ** 2;
        if (d < bd) { bd = d; best = { x, y }; }
      }
      return best;
    };
    // ore → 드릴 → 벨트 → target 인접
    BOT.feed = (kind, target) => {
      const o = BOT.oreNear(kind, target.x, target.y); if (!o) return false;
      const goal = (x, y) => Math.abs(x - target.x) + Math.abs(y - target.y) === 1;
      const adj = Math.abs(o.x - target.x) + Math.abs(o.y - target.y) === 1;
      const r = adj ? [o] : BOT.belt(o, goal);
      if (!r) return false;
      if (!BOT.P('drill', o.x, o.y)) return false;
      for (let i = 1; i < r.length; i++) { const nx = i + 1 < r.length ? r[i + 1] : target; BOT.P('conveyor', r[i].x, r[i].y, BOT.dirTo(r[i], nx)); }
      return true;
    };
  });

  // 1단계: 경제 2줄 + 전방 듀오 3(급탄) + 병영 2
  const built = await page.evaluate(() => {
    const log = [];
    const coreAdj = (x, y) => { for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (Math.abs(x - (core.x + dx)) + Math.abs(y - (core.y + dy)) === 1) return true; return false; };
    for (let n = 0; n < 2; n++) {
      const o = BOT.oreNear('c', core.x, core.y); if (!o) break;
      const r = BOT.belt(o, coreAdj); if (!r) break;
      if (!BOT.P('drill', o.x, o.y)) break;
      // 마지막 벨트는 실제로 인접한 코어 타일을 향해야 배달됨
      const last = r[r.length - 1];
      let tgt = { x: core.x, y: core.y };
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
        if (Math.abs(last.x - (core.x + dx)) + Math.abs(last.y - (core.y + dy)) === 1) tgt = { x: core.x + dx, y: core.y + dy };
      for (let i = 1; i < r.length; i++) { const nx = i + 1 < r.length ? r[i + 1] : tgt; BOT.P('conveyor', r[i].x, r[i].y, BOT.dirTo(r[i], nx)); }
      log.push('econ' + n);
    }
    // 방어 듀오 2 — 병영은 공장 완성 후 (훈련이 저축을 다 먹으므로)
    let duos = 0;
    for (let x = core.x + 5; x <= core.x + 10 && duos < 2; x++) for (let y = core.y - 4; y <= core.y + 5 && duos < 2; y++) {
      if (BOT.P('duo', x, y)) { duos++; BOT.feed('c', { x, y }); }
    }
    return log.concat(['duos:' + duos, 'copper:' + Math.floor(copper)]);
  });
  console.log('빌드:', JSON.stringify(built));

  // 2단계 이후: 자금이 차면 합금 사슬(제련소+발전기 → 병영), 상태 루프
  let factory = false;
  const t0 = Date.now(), LIMIT = +process.env.BOT_MS || 420000;
  let lastLog = 0, final = null;
  while (Date.now() - t0 < LIMIT) {
    const s = await page.evaluate(() => ({
      copper: Math.floor(copper),
      allies: enemies.filter(e => !e.dead && (e.team ?? 1) === 0).length,
      foes: enemies.filter(e => !e.dead && (e.team ?? 1) === 1).length,
      my: Math.ceil(core.hp), ai: Math.ceil(core2.hp), t: Math.floor(skirmishT),
      over: gameOver, am: allyMode, aim: aiMode,
      heavies: enemies.filter(e => !e.dead && e.type === 'heavy' && (e.team ?? 1) === 0).length,
    }));
    final = s;
    if (s.over) break;
    if (Date.now() - lastLog > 20000) { console.log(JSON.stringify(s)); lastLog = Date.now(); }
    // 1) 공장 먼저: 제련소+발전기 (합금 사슬 골격 — 병영은 나중에 옆에 붙임)
    if (!factory && s.copper > 380) {
      factory = await page.evaluate(() => {
        let sm = null;
        for (let y = core.y - 4; y <= core.y + 5 && !sm; y++) for (let x = core.x + 1; x <= core.x + 6 && !sm; x++)
          if (BOT.P('smelter', x, y)) sm = { x, y };
        if (!sm) return false;
        let gen = null;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (BOT.P('generator', sm.x + dx, sm.y + dy)) { gen = { x: sm.x + dx, y: sm.y + dy }; break; }
        }
        if (gen) BOT.feed('k', gen);
        BOT.feed('t', sm); BOT.feed('c', sm);
        window.SMELTER_POS = sm;
        return true;
      });
      if (factory) console.log('[공장] 합금 사슬 건설');
    }
    // 2) 공장이 서면 병영을 제련소 옆에 (합금이 병영으로 흘러 중장병)
    if (factory && s.copper > 260) {
      const bkNew = await page.evaluate(() => {
        const myBk = builds.filter(b => b.type === 'barracks' && (b.team || 0) === 0).length;
        if (myBk >= 2) return false;
        const sm = window.SMELTER_POS;
        if (myBk === 0 && sm) { // 첫 병영은 제련소 인접 — 제련소가 합금을 직접 밀어넣음
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            if (BOT.P('barracks', sm.x + dx, sm.y + dy)) return true;
        }
        for (let y = core.y - 4; y <= core.y + 5; y++) for (let x = core.x + 1; x <= core.x + 7; x++)
          if (BOT.P('barracks', x, y)) return true;
        return false;
      });
      if (bkNew) console.log('[병영] 건설');
    }
    // 3) 여유 자금 → 방어 듀오 증설
    if (s.copper > 350) {
      await page.evaluate(() => {
        const myDuo = builds.filter(b => b.type === 'duo' && (b.team || 0) === 0).length;
        if (myDuo < 4) {
          for (let x = core.x + 5; x <= core.x + 10; x++) for (let y = core.y - 4; y <= core.y + 5; y++)
            if (BOT.P('duo', x, y)) { BOT.feed('c', { x, y }); return; }
        }
      });
    }
    // 진군/귀환: 중장병 3+ 또는 병력 22+면 진군, 5 미만이면 귀환 재집결
    if (s.am === 'defend' && (s.heavies >= 3 || s.allies >= 22)) { await page.click('#wavebtn'); console.log(`⚔ 진군 (병력 ${s.allies}, 중장 ${s.heavies})`); }
    else if (s.allies < 5 && s.am === 'attack') { await page.click('#wavebtn'); console.log('🛡 귀환 재집결'); }
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: __dirname + '/shot-skirmish.png' });
  console.log('═══ 최종:', JSON.stringify(final));
  await browser.close();
})().catch(e => { console.error('BOT ERROR:', e.message); process.exit(1); });
