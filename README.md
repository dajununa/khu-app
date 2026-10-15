# 생활과학대학 시설 신고 (모바일 웹앱)

경희대 생활과학대학 PortalCam 3D 스캔 위에서 하자·분실물을 핀으로 가리켜 신고하는 웹앱.

## 실행
```bash
npm install     # 처음 한 번
npm run dev     # 서버 시작 → 터미널에 나온 Network 주소(http://192.168.x.x:5173)를 폰에서 열기
```
폰과 컴퓨터가 **같은 Wi-Fi**여야 합니다. 신고 데이터는 `data/` 폴더에 저장됩니다(전원 공개, 익명).

## 화면
- `#/` 첫 화면: **고장 신고 / 빈 강의실 / 편의시설** 세 칸
- `#/fix` 고장 신고 (입면도 → 평면도 → 3D 스캔에서 핀)
- `#/rooms` 빈 강의실: 날짜·시간을 골라 수업 중 / 자습 가능 확인, 강의실을 눌러 팀플 대여 신청
- `#/amen` 편의시설: 입면도로 층별·항목별 한눈에 보기 → 층을 누르면 평면도에서 정확한 위치, 누르면 세부정보
- `#/admin` 관리자 (학생 화면에는 버튼 없음): 신고 처리, 강의실·시간표(CSV 업로드, 휴강·보강·특강), 편의시설 위치 찍기, 대여 승인

## 배포(Supabase) 처음 설정
1. Supabase 대시보드 > SQL Editor 에서 `supabase/setup.sql`(이미 했으면 생략) → `supabase/features.sql` 순서로 실행.
   `features.sql` 맨 아래 `'관리자 이메일'` 을 실제 관리자 이메일로 바꾸고 실행하세요.
2. Authentication > Users > **Add user** 로 그 이메일의 계정(비밀번호)을 만든다.
3. `khu-app.vercel.app/#/admin` 에서 그 이메일·비밀번호로 로그인.

## 로컬 관리자
`npm run dev` 로 Supabase 없이 실행할 때는 `#/admin` 에서 이메일은 아무거나, 비밀번호는 `0000`(또는 `ADMIN_PIN` 값).
데이터는 `data/` 폴더에 저장됩니다.

## 구성
- `src/screens/` hub(첫 화면) · home(신고 입면도) · plan(평면도) · tour(3D) · report(신고폼) · board(접수현황) · rooms(빈 강의실) · amenities(편의시설) · admin(관리자)
- `src/data/amenities.js` 편의시설 종류(아이콘 글자·색·기본 세부정보 항목)
- `src/data/config.js` 의 `OFFICE.phone` 에 행정실 번호를 넣으면 강의실 화면에 문의 버튼이 생김
- `src/data/config.js` 층, 스캔 파일, 호실(513호) 위치 설정
- `scripts/make_waypoints.py` 스캔 경로(poses.json)에서 이동 지점 만들기
- `server/api.js` 게시판 API, `server/db.js` 로컬용 강의실·편의시설 저장소
- `supabase/features.sql` 강의실·시간표·대여·편의시설·관리자 테이블과 권한
- `public/scans/` 스캔 데이터(.sog), `public/data/waypoints.json` 이동 지점
