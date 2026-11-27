# SPEC: 2027 상하이 3박4일 여행 결정·구성 페이지

## 목적
남자 3명(민희 + 친구 2명)이 링크 하나로 함께 날짜·항공·숙소·장소를 고르고 1~4일차 일정을 짜는 공유 웹페이지.
GitHub Pages(`https://pkaso903-ted.github.io/shanghai-2027/`)에서 정적으로 서비스하고, 투표·찜·일정·지출·체크는 Firestore로 실시간 동기화한다.

## 절대 규칙
- 빌드 도구 없음. 순수 HTML/CSS/JS(ES module). `index.html`, `css/app.css`, `js/*.js`, `data/*.json`.
- 외부 라이브러리는 CDN ES module만: Firebase JS SDK 10.12.5 (gstatic), Leaflet 1.9.4(지도, 선택). 그 외 금지.
- 모든 화면 문구는 한국어. 이모지 금지. 이탤릭 금지. 밝은 테마. 모바일 우선(375px 기준), PC에서도 깔끔(최대 폭 960px 중앙).
- 데모·가짜 데이터 금지. 화면 내용은 `data/*.json`과 Firestore에서만 온다. 데이터 파일이 비어 있으면 "자료 준비 중"만 표시.
- `data/*.json`은 내가(에이전트) 관리한다. 앱 코드에서 데이터 파일 내용을 바꾸거나 새로 만들지 말 것. 스키마는 아래와 같다. `places.json`, `hotels.json`은 아직 없으니 스키마대로 동작하게 만들고, 테스트용 파일은 `tests/fixtures/`에만 둘 것(배포 경로에 섞지 말 것).
- 로그인 없음: 링크만 있으면 누구나 편집. 첫 방문 시 "나는 누구?" 이름 선택(민희 / 친구1 / 친구2 기본, 이름 변경 가능 - 멤버 이름은 Firestore에 저장되어 셋 모두에게 같게 보임). 선택은 localStorage에 기억, 상단에서 언제든 변경.
- Firebase 익명 인증(signInAnonymously) 후 Firestore 사용.

## Firebase
```js
const firebaseConfig = {"apiKey": "AIzaSyCgjqWCQpAaqgcwge11Hl3hx91fsaltgd0", "authDomain": "daily-english-jmh.firebaseapp.com", "projectId": "daily-english-jmh", "storageBucket": "daily-english-jmh.firebasestorage.app", "messagingSenderId": "1058181338255", "appId": "1:1058181338255:web:adf9447e21fd9f6c4e0cfa"};
const TRIP_ID = "sh27-b2yiwx52n136pjcnoa37";   // 문서 id. 바꾸지 말 것
```
- 컬렉션 `shanghai2027`, 문서 `shanghai2027/{TRIP_ID}` 하나에 공유 상태 전체를 둔다. 변경 기록은 하위 컬렉션 `shanghai2027/{TRIP_ID}/log/{autoId}`.
- 보안 규칙(이미 배포됨): 인증된 사용자만 읽기/생성/수정, 삭제 불가, log는 생성만 가능(수정·삭제 불가), 문서 id 16자 이상.
- 동시 편집 충돌 방지: 문서 전체 덮어쓰기 금지. 항상 `updateDoc`의 점 경로(field path)로 바꾼 필드만 갱신(예: `votes.date.<memberId>`), 배열 순서 변경이 필요한 일정은 `plan.d1` 같은 날짜 단위 필드만 교체. 문서가 없으면 `setDoc(..., {merge:true})`로 생성.
- `onSnapshot`으로 실시간 반영. 연결 상태 배지(연결됨 / 오프라인 - 변경은 연결되면 반영) 상단 표시. Firestore 오프라인 캐시 사용(persistentLocalCache).

### 공유 문서 구조 (예)
```
members: { m1:{name:"민희"}, m2:{name:"친구1"}, m3:{name:"친구2"} }
votes: {
  date: { m1:"A", m2:"B" },
  flight: { m1:"B|B-out-ICN-0825|B-in-PVG-1120" },          // 날짜옵션|가는편id|오는편id
  hotelArea: { m1:"bund" },
  hotel: { m1:["h03","h07"] }
}
likes: { "<placeId>": { m1:true, m3:true } }
decided: { date:"B"|null, flight:"B|..|.."|null, hotel:"h03"|null, by:"m1", at:<ts> }
plan: { d1:[{pid:"f01", time:"12:00", memo:"", by:"m2"}], d2:[...], d3:[...], d4:[...] }
customPlaces: { "<id>": {name, cat, area, memo, url, by} }   // 사용자가 직접 추가하는 장소
expenses: { "<id>": {title, amountKrw, amountCny, payer:"m1", split:["m1","m2","m3"], cat, date, by, at} }
checks: { "<checkId>": { m1:true, m2:false } }
comments: { "<targetKey>": { "<id>": {by, text, at} } }   // 섹션·항공·숙소·장소별 한 줄 의견
budget: { foodPerDayKrw: 70000, localTransportKrw: 60000, etcKrw: 50000 }   // 셋 중 누구나 수정
```
- 모든 변경마다 log 문서 1개 생성: `{by, byName, action, target, before, after, at: serverTimestamp()}`. 사람이 읽는 문장도 함께(`text`: "민희가 날짜를 B안으로 투표").
- 실수 복구: 변경 기록 화면에서 일정(plan)·확정(decided) 변경 항목은 "이 상태로 되돌리기" 버튼 제공(before 값으로 다시 update, 그 자체도 log).

## 화면 구성 (상단 고정 탭 또는 스크롤 섹션 + 하단 탭바, 모바일 기준)
0. 상단 요약 (홈)
   - 제목 "2027 상하이 3박4일", 확정된 날짜 기준 D-day(미확정이면 A/B 둘 다 표시)
   - 결정 현황 카드: 날짜 / 항공 / 숙소 지역 / 숙소 / 일정(배치된 장소 수) - 각각 "투표 중 (A 2 : B 1)" 또는 "확정" 상태
   - 1인 예상 경비 (경비 섹션 계산값), 접속 중인 멤버 표시(최근 2분 내 활동)
   - 최근 변경 5건
1. 날짜 A vs B: `data/dateCompare.json`의 rows를 2열 비교표로. win 값에 따라 우세한 쪽 칸 강조(A/B/same/tbd 범례 표시). 하단에 각자 투표 버튼(A/B), 득표 현황, "확정" 버튼(누구나 가능, 확정 시 확인창, 확정 해제 가능). sources 링크.
2. 항공권: `data/flights.json`
   - 날짜 옵션 A/B 탭(확정된 날짜가 있으면 그 탭 기본). 가는 편/오는 편 목록.
   - 필터: 저가항공만 / 시간 조건 맞는 편만(가는 편 출발 12:00 이전, 오는 편 한국 도착 13:00~16:00) / 공항(인천-푸둥 / 김포-훙차오).
   - 정렬: 출발시간 / 가격.
   - 각 편 행: 출발-도착(+1 표시), 항공사(공동운항 작게), 공항, 저가 배지, 수하물 메모, 가격(원). `prevPrice`가 있으면 ▲/▼ 금액 차이 표시(올랐으면 빨강, 내렸으면 파랑).
   - 가는 편 하나 + 오는 편 하나 선택 → 조합 카드: 1인 합계, 3인 합계, 현지 체류 시간(도착~출발), 조건 충족 여부. "이 조합에 투표". 조합별 득표 목록. "확정" 버튼.
   - 상단에 "가격 조회일: checkedAt · 출처" 표시. history 배열이 있으면 "지난 조회 대비" 안내.
3. 숙소: `data/hotels.json`
   - 지역 비교 카드(areas: 장점/단점/지하철/공항·훙차오역 이동/가격대/추천 대상), 지역 투표.
   - 숙소 후보 카드(hotels): 지역 필터, 이름(한/영/중), 등급, 평점, 객실 구성, A/B 3박 총액과 1박 가격(확정 날짜 쪽 강조), 1인당 금액(총액/3), 지하철, 메모, 예약 링크. 각자 찜(복수 선택), 득표 많은 순 정렬 옵션, "확정".
   - 지도 보기(Leaflet + OpenStreetMap 타일, lat/lng 있을 때만).
4. 장소 후보: `data/places.json` (배열, 약 60~100개) + customPlaces
   - 카테고리 탭: 전체 / 먹거리 / 관광 / 야경 / 근교 / 쇼핑 / 밤놀이 / 마사지. 하위분류(sub) 칩.
   - 지역 필터, 검색(한/중/영 이름), 정렬: 찜 많은 순 / 평점 / 이름.
   - 카드: 사진(photo 있으면), 이름 한국어 + 중국어(택시 기사에게 보여주기용 크게 보기 버튼), 한 줄 설명, 지역, 평점(rating 객체의 값들을 "구글 4.6 (1.2만)" 식으로), 가격대, 영업시간·휴무, 예약 필요 여부, 소요시간, 인기 근거(evidence), 팁, 대표 메뉴(must_order), 지도 링크(고덕지도/구글지도 좌표 링크), 출처 링크.
   - 찜(하트) 버튼: 셋 각각, 카드에 찜한 사람 이니셜 표시.
   - "일정에 넣기" → 1~4일차 선택.
   - "장소 직접 추가" 폼(이름, 분류, 지역, 메모, 링크) → customPlaces.
   - 장소 상세에서 한 줄 의견(comments).
5. 일정 짜기 (1~4일차)
   - 날짜 확정 전에는 A/B 중 득표 많은 쪽(동률이면 A) 날짜로 표시하고 "미확정" 표시.
   - 각 일차 칸: 확정 항공편 있으면 1일차 맨 위 "도착 HH:MM 푸둥공항", 4일차 맨 아래 "출발 HH:MM" 자동 표시.
   - 장소 블록: 시간(선택), 메모, 위/아래 이동, 다른 날로 이동, 삭제. 모바일에서 드래그 대신 버튼으로 확실히 동작(드래그는 PC 보너스).
   - 일차별: 이동 거리 합계(연속 장소 직선거리 km, 좌표 있을 때), 월요일 휴무 등 closed 경고(해당 날짜 요일과 closed 문자열의 요일 일치 시 경고 배지).
   - 찜한 장소 목록을 일정 화면 옆/아래에 "아직 안 넣은 찜" 으로 보여주고 바로 추가.
   - 일차별 지도(Leaflet, 순서 번호 마커 + 선).
6. 경비·정산
   - 예상 경비: 항공(확정 조합 또는 현재 최다 득표 조합, 없으면 최저 조합) + 숙소(확정 숙소 총액/3, 없으면 후보 평균) + 식비/일 x4 + 현지교통 + 기타 → 1인·3인 합계. budget 값은 누구나 수정.
   - 실제 지출 기록: 제목, 금액(원 또는 위안 - 위안 입력 시 환율 적용, 환율은 입력값으로 기본 190원/위안, 수정 가능하며 budget.cnyRate에 저장), 낸 사람, 나눌 사람, 분류, 날짜. 목록·합계.
   - 정산: 사람별 낸 돈/써야 할 돈/차액, "누가 누구에게 얼마" 최소 송금 목록.
7. 준비 체크리스트: `data/checklist.json` 그룹별, 항목마다 멤버 3명 체크박스(각자 자기 것만 체크, 다른 사람 상태는 보기), 전체 진행률. 항목 직접 추가 가능(customChecks).
8. 변경 기록: log 최신순(무한 스크롤 또는 50개씩 더보기), 사람·섹션 필터, 되돌리기(5의 규칙).

## 데이터 파일 스키마
- `data/flights.json`: {checkedAt, source, currency, history:[{checkedAt, note}], options:{A:{out:[편], in:[편]}, B:{...}}}
  편: {id, dir, date, dep "HH:MM", arr, nextDay bool, from, to, airline, codeshare, lcc bool, price, prevPrice|null, bag, note}
- `data/dateCompare.json`: {checkedAt, options:{A:{label,range,start,end,nights,leave},B}, rows:[{k,A,B,win:"A"|"B"|"same"|"tbd",note}], sources:[{t,u}]}
- `data/checklist.json`: {items:[{id, group, t, note}]}
- `data/places.json` (나중에 추가): [{id, cat:"food"|"sight"|"night"|"daytrip"|"shopping"|"nightlife"|"massage", sub, name_ko, name_zh, name_en, branch?, area, oneliner, must_order?:[], price_cny?, ticket_cny?, hours, closed, reservation, queue?, duration_min, best_time?, rating:{google?, dianping?, tripadvisor?, other?}, evidence, transport?, lat, lng, tips, sources:[url], photo?:"photos/xxx.jpg"}]
- `data/hotels.json` (나중에 추가): {checkedAt?, areas:[{key,name,pros:[],cons:[],metro,to_pvg,to_hongqiao,price_level,best_for}], hotels:[{id, area, name_ko, name_en, name_zh, stars, rating, room, priceA_krw, priceB_krw, nightA_krw, nightB_krw, price_source, metro, lat, lng, note, url}]}
- 숫자 null 허용. 없는 필드는 화면에서 숨김.
- 데이터 파일은 캐시 문제 방지: fetch 시 `?v=<data/version.json의 v>` 붙이기. `data/version.json` = {"v":"2026-11-26-1"} (내가 갱신 시 올림).

## 기타
- 앱 버전 표시(하단), 서비스워커는 쓰지 말 것(갱신 지연 방지).
- 공유 버튼: 링크 복사(navigator.clipboard, 실패 시 선택 가능한 입력창).
- 접근성: 버튼 최소 44px, 대비 충분.
- 성능: 첫 로드 1초 내(데이터 지연 로드 가능).
- 중국어 크게 보기: 전체 화면에 name_zh + 주소용 텍스트를 큰 글씨로.

## 검증 (완료 전 반드시)
- `tests/`에 Playwright 또는 순수 Node 스크립트로: (1) 데이터 파일 로드 렌더 확인 (2) 두 개의 브라우저 컨텍스트로 같은 TRIP_ID를 열어 한쪽 투표/찜/일정 추가가 다른 쪽에 5초 안에 보이는지 (3) 정산 계산 단위 테스트. 단, 실데이터 문서를 더럽히지 않도록 테스트는 `?trip=test-<랜덤16자>` 쿼리로 TRIP_ID를 바꿔 실행할 수 있게 하라(앱이 `?trip=` 쿼리를 지원, 16자 이상일 때만).
- `python3 -m http.server`로 로컬 확인 가능해야 함.
- 완료되면 `DONE.md`에 만든 것 / 남은 것 / 테스트 결과를 적고 커밋(푸시는 하지 말 것 - 에이전트가 함).
