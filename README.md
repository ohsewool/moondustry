# 🌙 MoonDustry (문더스트리)

[Mindustry](https://github.com/Anuken/Mindustry)에서 영감을 받은 **웹 기반 타워디펜스** — 단일 HTML 파일 게임 + Cloudflare Workers 배포.

- **물류가 핵심**: 드릴이 캔 구리를 컨베이어로 운반 → 코어에 넣으면 돈, 포탑에 꽂으면 탄약. 보급선이 끊기면 포탑은 침묵한다.
- 라우터(분기), 멘더(수리), 벽, 포탑 3종(듀오/스캐터/랜서) + **T1→T3 강화**
- 병목 지형 절차 생성 맵, 적 5종(원거리 사격·자폭·공중·**5웨이브마다 보스**)
- 킬 콤보, 화면 흔들림·파편·반동 등 연출, Web Audio 합성 사운드/BGM (외부 에셋 0개)
- **2인 협동 멀티플레이** (Cloudflare Durable Object 릴레이)
- 목표: 웨이브 20 클리어

## 프로젝트 구조

```
moondustry/
├── public/
│   ├── index.html      # 게임 전체 (HTML+CSS+JS 단일 파일)
│   └── classic/        # 오리지널 Mindustry Classic HTML5 빌드 (GPL, 하단 참고)
├── worker.js           # 멀티플레이 방 릴레이 (Durable Object: RoomDO)
├── wrangler.jsonc      # Cloudflare Workers 설정
├── package.json
└── tools/              # 테스트 도구 (하단 참고)
```

## 요구사항

- **Node.js 18+** (게임 자체는 브라우저만 있으면 됨 — Node는 서버 실행/배포/테스트용)
- 그 외 전부 `npm install`로 해결

## 실행

```bash
npm install

# 로컬 서버 (멀티플레이 포함) → http://localhost:8787
npm run dev
```

싱글플레이만 볼 거면 서버 없이 `public/index.html`을 브라우저로 열어도 됩니다 (협동 모드만 서버 필요).

### 조작법

| 입력 | 동작 |
|---|---|
| 클릭 / 드래그 | 건설 (컨베이어는 드래그 방향으로 자동 회전) |
| `1`~`8` | 건물 선택 |
| `R` | 컨베이어 방향 회전 |
| 우클릭 | 판매 / 선택 취소 |
| 지은 포탑 클릭 | 강화(T1→T3)·판매 패널 |
| `Space` / `F` / `M` | 일시정지 / 배속 / 음소거 |

## 배포 (Cloudflare)

```bash
# ① 임시 배포 — 로그인 불필요, 단 주소가 매번 바뀌고 만료될 수 있음
npm run deploy:temp

# ② 정식 배포 — 주소 영구 유지 (권장)
# dash.cloudflare.com → My Profile → API Tokens → "Edit Cloudflare Workers" 템플릿
CLOUDFLARE_API_TOKEN=<토큰> npm run deploy
```

정식 배포하면 `moondustry.<계정서브도메인>.workers.dev`로 고정됩니다.
멀티플레이(Durable Object)는 무료 플랜에서도 동작합니다 (SQLite 클래스 사용).

## 협동 멀티플레이 구조

호스트 권위(host-authoritative) + 릴레이 방식:

1. 첫 접속자가 **호스트** — 브라우저에서 시뮬레이션 전체를 실행
2. 게스트는 `/?room=코드`로 접속 — 호스트가 초기 상태(`init`)를 보내고 8Hz로 스냅샷(`snap`) 전송
3. 게스트의 건설/판매/강화/웨이브 명령(`cmd`)은 호스트가 검증 후 실행
4. `worker.js`의 `RoomDO`는 메시지를 중계만 함 (게임 로직 없음)
5. 호스트가 나가면 방 종료

## 테스트 도구 (`tools/`)

| 명령 | 내용 | 요구사항 |
|---|---|---|
| `npm run test:sim` | **헤드리스 로직 시뮬레이션** — 브라우저 없이 맵 생성 10회 품질 검사(경로 보장·광석 배치) + 물류·전투 300초 시뮬레이션. 리팩토링 후 회귀 확인용. 수 초 소요 | Node만 |
| `npm run test:bot` | **봇 플레이어** — 실제 브라우저에서 전략적으로 플레이(경제→방어→강화→증원, 4배속). 밸런스 검증용. 스크린샷을 `tools/shot-*.png`로 저장. ~5분 소요 | Playwright† |
| `npm run test:mp` | **멀티플레이 스모크 테스트** — 호스트+게스트 2개 브라우저로 방 생성→동기화→상호 건설 검증. `npm run dev`를 먼저 켜둘 것 (또는 `BASE_URL=<배포주소>`로 프로덕션 대상 실행) | Playwright† |

† Playwright 브라우저 설치: `npx playwright install chromium` (권한 있으면 `--with-deps`).
루트 권한이 없는 환경(conda 기반 등)에서 시스템 라이브러리가 없다는 오류가 나면:

```bash
mamba install -y -c conda-forge nss nspr alsa-lib libcups atk at-spi2-atk at-spi2-core \
  gtk3 libxkbcommon xorg-libxcomposite xorg-libxdamage xorg-libxrandr
LD_LIBRARY_PATH=/opt/conda/lib npm run test:bot
```

봇 대상 URL 변경: `GAME_URL=https://... npm run test:bot`

## 게임 밸런스 메모 (튜닝 포인트)

전부 `public/index.html` 상단 상수에 모여 있음:

- `DEFS` — 건물 비용/체력/공격력/사거리, 드릴 채굴 주기(`mine: 1.5`초)
- `EDEFS` — 적 체력/속도/보상/사거리 (보스 포함)
- `ITEM_VALUE`(구리 1개=10원) / `AMMO_PER_ITEM`(1개=6발) / `AMMO_MAX`(30)
- `waveComp()` — 웨이브별 적 구성, `hpMul`(웨이브당 +13%)
- 강화 배율: `updateTurret()`의 공격력 ×1.6 / 사거리 +18 / 연사 ×1.14, `upCost()`

## 라이선스

- **moondustry 자체 코드** (`public/index.html`, `worker.js`, `tools/`): MIT — Mindustry의 코드/에셋을 사용하지 않은 독자 구현이며, 게임 디자인에서 영감을 받았습니다.
- **`public/classic/`**: [Mindustry Classic](https://github.com/Anuken/Mindustry-Classic) (© Anuken, **GPL v3**)의 HTML5(GWT) 컴파일 결과물. 소스는 원 저장소 참고. 빌드 재현 방법:
  1. JDK 8 필수 (`mamba create -n jdk8 -c conda-forge openjdk=8`)
  2. `build.gradle`의 GWT 플러그인을 `org.wisepersist:gwt-gradle-plugin:1.0.6`으로 교체 (원본 플러그인은 jcenter 폐쇄로 소멸)
  3. `settings.gradle`에서 `android`, `ios` 모듈 제거 (+ 해당 `project(...)` 블록 삭제)
  4. `JAVA_HOME=<jdk8> ./gradlew html:dist` → `html/build/dist/`를 `public/classic/`으로 복사 (`WEB-INF` 제외)
