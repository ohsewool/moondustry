// ── 맵 생성 10회 품질 검사 ──
const mapStats=[];
for(let trial=0; trial<10; trial++){
  builds=[]; enemies=[]; bullets=[]; parts=[];
  genMap();
  let floor=0, ore=0, oreT=0, oreNearCore=0, oreMid=0;
  for(let y=0;y<MH;y++) for(let x=0;x<MW;x++){
    const t=map[y][x];
    if(!t.rock) floor++;
    if(t.ore){
      ore++;
      if(t.ore==='t') oreT++;
      const d=Math.hypot(x-(core.x+1),y-(core.y+1));
      if(d<=10) oreNearCore++; else oreMid++;
    }
  }
  const reachable=spawns.every(s=>flow[s.y][s.x]!==Infinity);
  mapStats.push({reachable, floorPct:Math.round(floor/(MW*MH)*100), ore, oreT, oreNearCore, oreMid});
}
// ── 마지막 맵에서 물류+전투 시뮬레이션 ──
started=true; copper=99999;
const oreTile=map[core.y][core.x-1]; oreTile.ore='c'; oreTile.rock=false; oreTile.b=null;
place('drill', core.x-1, core.y);
const ty=core.y+3, tx0=core.x-6;
for(let i=0;i<5;i++){ const t=map[ty][tx0+i]; t.rock=false; t.b=null; t.ore=(i===0?'c':null); }
computeFlow();
place('drill',tx0,ty);
ghostRot=1; place('conveyor',tx0+2,ty);            // 세로 벨트 →
ghostRot=0;
place('conveyor',tx0+1,ty); place('conveyor',tx0+2,ty); // 가로로 가로지르면 정션으로 변환
place('conveyor',tx0+3,ty);
place('duo',tx0+4,ty);
const chainDuo=map[ty][tx0+4].b; if(chainDuo) chainDuo.ammo=0;
const junctionOk = !!(map[ty][tx0+2].b && map[ty][tx0+2].b.type==='junction');
// ── 제련 사슬: 구리 드릴 + 티타늄 드릴 → 제련소 → 스펙터 ──
const sy=core.y-3, sx0=core.x-6;
for(let i=0;i<3;i++){ const t=map[sy][sx0+i]; t.rock=false; t.b=null; t.ore=null; }
const tUp=map[sy-1][sx0+1]; tUp.rock=false; tUp.b=null; tUp.ore=null;
map[sy][sx0].ore='c'; map[sy][sx0+2].ore='t';
computeFlow();
place('drill',sx0,sy); place('smelter',sx0+1,sy); place('drill',sx0+2,sy);
place('spectre',sx0+1,sy-1);
const chainSpectre=map[sy-1][sx0+1].b; if(chainSpectre) chainSpectre.ammo=0;
let placedT=0;
for(let r=2;r<=4;r++) for(let y=core.y-r;y<=core.y+1+r;y++) for(let x=core.x-r;x<=core.x+1+r;x++)
  if(placedT<10 && canPlace('duo',x,y)){ place('duo',x,y); map[y][x].b.ammo=1e9; placedT++; }
// 스폰 캠핑 차단 검증
const campBlocked = !canPlace('duo', spawns[0].x+2, spawns[0].y);
copper=0; waveTimer=5;
let crashed=null;
try{ for(let i=1;i<=6000;i++) tick(i*50); }
catch(e){ crashed=String(e.stack).split('\n').slice(0,4); }
console.log(JSON.stringify({
  mapStats, campBlocked, crashed, junctionOk,
  chainDuoAmmo: chainDuo?chainDuo.ammo:'배치 실패',
  chainSpectreAmmo: chainSpectre?chainSpectre.ammo:'배치 실패',
  copperEarned: Math.floor(copper), wave, kills, coreHp:Math.ceil(core.hp), gameOver
}));
