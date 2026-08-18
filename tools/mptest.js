// 멀티플레이 스모크 테스트: 호스트+게스트 2개 페이지
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8787';
(async () => {
  const browser = await chromium.launch();
  const host = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await host.goto(BASE + '/');
  await host.click('#coopbtn');
  await host.waitForFunction(() => netMode === 'host', null, { timeout: 10000 });
  const room = await host.evaluate(() => netRoom);
  console.log('방 생성:', room);
  await host.click('#startbtn');

  const guest = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await guest.goto(`${BASE}/?room=${room}`);
  await guest.click('#startbtn');
  await guest.waitForFunction(() => started === true, null, { timeout: 10000 });
  console.log('게스트 입장 완료 (init 수신)');

  // 호스트가 광석에 드릴 건설
  const spot = await host.evaluate(() => {
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++)
      if (map[y][x].ore && canPlace('drill', x, y)) { place('drill', x, y); return { x, y }; }
    return null;
  });
  console.log('호스트 드릴 건설:', JSON.stringify(spot));
  await guest.waitForFunction(
    s => builds.some(b => b.type === 'drill' && b.x === s.x && b.y === s.y), spot, { timeout: 5000 });
  console.log('✔ 게스트 화면에 호스트의 드릴 동기화됨');

  // 게스트가 벽 건설 명령 → 호스트 월드에 반영되는지
  const wallSpot = await guest.evaluate(() => {
    for (let y = 0; y < MH; y++) for (let x = 8; x < MW; x++)
      if (canPlace('wall', x, y)) { place('wall', x, y); return { x, y }; } // 게스트 place → cmd 전송
    return null;
  });
  console.log('게스트 벽 건설 요청:', JSON.stringify(wallSpot));
  await host.waitForFunction(
    s => builds.some(b => b.type === 'wall' && b.x === s.x && b.y === s.y), wallSpot, { timeout: 5000 });
  console.log('✔ 게스트의 건설 명령이 호스트 월드에 반영됨');

  // 스냅샷 동기화 상태 비교
  await new Promise(r => setTimeout(r, 1500));
  const h = await host.evaluate(() => ({ builds: builds.length, copper: Math.floor(copper), wave }));
  const g = await guest.evaluate(() => ({ builds: builds.length, copper: Math.floor(copper), wave }));
  console.log('호스트:', JSON.stringify(h), '/ 게스트:', JSON.stringify(g));
  console.log(h.builds === g.builds && h.wave === g.wave ? '✔ 상태 일치' : '✖ 상태 불일치');

  await guest.screenshot({ path: `${__dirname}/shot-mp-guest.png` });
  await browser.close();
})().catch(e => { console.error('MP TEST FAIL:', e.message); process.exit(1); });
