#!/usr/bin/env bash
# 헤드리스 로직 시뮬레이션: 브라우저 없이 맵 생성 10회 검사 + 물류/전투 300초 시뮬레이션
set -e
cd "$(dirname "$0")"
node -e "
const fs = require('fs');
const html = fs.readFileSync('../public/index.html', 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
fs.writeFileSync('game.js', m[1]);
"
cat stub.js game.js driver.js > test.js
timeout 120 node test.js
rm -f game.js test.js
