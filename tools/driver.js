// ── 맵 생성 10회 품질 검사 ──
const mapStats=[];
for(let trial=0; trial<10; trial++){
  builds=[]; enemies=[]; bullets=[]; parts=[];
  genMap();
  let floor=0, ore=0, oreNearCore=0, oreMid=0;
  for(let y=0;y<MH;y++) for(let x=0;x<MW;x++){
    const t=map[y][x];
    if(!t.rock) floor++;
    if(t.ore){
      ore++;
      const d=Math.hypot(x-(core.x+1),y-(core.y+1));
      if(d<=10) oreNearCore++; else oreMid++;
    }
  }
  const reachable=spawns.every(s=>flow[s.y][s.x]!==Infinity);
  mapStats.push({reachable, floorPct:Math.round(floor/(MW*MH)*100), ore, oreNearCore, oreMid});
}
// ── 마지막 맵에서 물류+전투 시뮬레이션 ──
started=true; copper=99999;
const oreTile=map[core.y][core.x-1]; oreTile.ore=true; oreTile.rock=false; oreTile.b=null;
place('drill', core.x-1, core.y);
const ty=core.y+3, tx0=core.x-6;
for(let i=0;i<5;i++){ const t=map[ty][tx0+i]; t.rock=false; t.b=null; t.ore=(i===0); }
computeFlow();
place('drill',tx0,ty); ghostRot=0;
place('conveyor',tx0+1,ty); place('conveyor',tx0+2,ty); place('conveyor',tx0+3,ty);
place('duo',tx0+4,ty);
const chainDuo=map[ty][tx0+4].b; if(chainDuo) chainDuo.ammo=0;
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
  mapStats, campBlocked, crashed,
  chainDuoAmmo: chainDuo?chainDuo.ammo:'배치 실패',
  copperEarned: Math.floor(copper), wave, kills, coreHp:Math.ceil(core.hp), gameOver
}));
