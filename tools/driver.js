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
// ── 제련+전력 사슬: 석탄드릴→발전기, 노드 급전, 구리+티타늄→제련소→스펙터 ──
const sy=core.y-3, sx0=core.x-6;
for(let i=0;i<3;i++){ const t=map[sy][sx0+i]; t.rock=false; t.b=null; t.ore=null; }
for(let i=-1;i<3;i++){ const t=map[sy-1][sx0+i]; t.rock=false; t.b=null; t.ore=null; }
map[sy][sx0].ore='c'; map[sy][sx0+2].ore='t'; map[sy-1][sx0-1].ore='k';
computeFlow();
place('drill',sx0,sy); place('smelter',sx0+1,sy); place('drill',sx0+2,sy);
place('drill',sx0-1,sy-1); place('generator',sx0,sy-1);
place('spectre',sx0+1,sy-1); place('node',sx0+2,sy-1);
const chainSpectre=map[sy-1][sx0+1].b; if(chainSpectre) chainSpectre.ammo=0;
const chainSmelter=map[sy][sx0+1].b;
// 전력 없는 제련소 대조군: 모든 노드 커버 밖에 고립 설치
const iy=core.y+6, ix=sx0+9;
if(map[iy] && map[iy][ix]){ map[iy][ix].rock=false; map[iy][ix].b=null; map[iy][ix].ore=null; computeFlow(); place('smelter',ix,iy); }
const lonelySmelter=map[iy] && map[iy][ix] ? map[iy][ix].b : null;
if(lonelySmelter){ lonelySmelter.inv={c:3,t:3}; }
// ── 실리콘 사슬: 모래드릴+석탄드릴 → 실리콘로 → 듀오(유도탄 전환) ──
const zy=core.y+9, zx0=core.x-6;
for(let i=-1;i<4;i++){ const t=map[zy][zx0+i]; t.rock=false; t.b=null; t.ore=null; }
for(let i=-1;i<4;i++){ const t=map[zy-1][zx0+i]; t.rock=false; t.b=null; t.ore=null; }
map[zy][zx0].ore='s'; map[zy][zx0+2].ore='k'; map[zy-1][zx0-1].ore='k';
computeFlow();
place('drill',zx0,zy); place('siliconer',zx0+1,zy); place('drill',zx0+2,zy);
place('drill',zx0-1,zy-1); place('generator',zx0,zy-1);
place('duo',zx0+1,zy-1); place('node',zx0+2,zy-1);
const siliconDuo=map[zy-1][zx0+1].b; if(siliconDuo) siliconDuo.ammo=0; // 구리탄 비우면 실리콘탄 수납
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
  poweredSmelterSat: chainSmelter?powerSat(chainSmelter):'배치 실패',
  lonelySmelterIdle: lonelySmelter ? (lonelySmelter.out.length===0 && lonelySmelter.inv.c===3) : '배치 실패',
  siliconDuo: siliconDuo ? {kind:siliconDuo.ammoKind, ammo:siliconDuo.ammo} : '배치 실패',
  copperEarned: Math.floor(copper), wave, kills, coreHp:Math.ceil(core.hp), gameOver
}));
