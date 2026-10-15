import { h, toast, ago } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { db, session, login, logout, setReportStatus } from '../lib/db.js';
import { FLOORS, STATUSES } from '../data/config.js';
import { AMENITY_TYPES, amenityType } from '../data/amenities.js';
import { loadPlan, planView, noPlan } from '../lib/floorplan.js';
import { fill, topbar, floorChips, openSheet, field, input, select, empty, loading } from '../lib/ui.js';
import { WEEKDAYS, HALF_HOURS, dateStr, dateLabel, busySegments, overlaps, pad2 } from '../lib/timetable.js';

// 관리자 화면 (#/admin...). 학생 화면에는 여기로 오는 버튼이 없다.
const FLOOR_IDS = FLOORS.map(f => f.id).reverse(); // B1 → 5F
const roomName = r => (r ? (r.code.match(/^\d/) ? r.code + '호' : r.code) : '(삭제된 강의실)');
const wrap = (...kids) => h('div', { class: 'admin-mode' }, ...kids);
const adminBar = (title, back = '#/admin', ...right) => topbar(title, back, ...right);
const confirmDo = (msg, fn) => () => { if (confirm(msg)) fn(); };
const timeSel = (v, props) => select(HALF_HOURS.includes(v) ? HALF_HOURS : [v, ...HALF_HOURS], v, props);

export function admin(sub, arg) {
  if (!session.get()) return loginScreen();
  if (sub === 'reports') return reports();
  if (sub === 'rooms') return roomsAdmin();
  if (sub === 'room') return roomEditor(arg);
  if (sub === 'amen') return amenAdmin();
  if (sub === 'rentals') return rentalsAdmin();
  return dashboard();
}

// ── 로그인 ───────────────────────────────────────────
function loginScreen() {
  const email = input({ type: 'email', autocomplete: 'username', placeholder: 'admin@khu.ac.kr' });
  const pw = input({ type: 'password', autocomplete: 'current-password' });
  const btn = h('button', { class: 'btn block', type: 'submit' }, '로그인');
  const form = h('form', { class: 'form', onSubmit: async e => {
    e.preventDefault();
    btn.disabled = true; btn.textContent = '확인 중…';
    try { await login(email.value.trim(), pw.value); location.hash = '#/admin'; dispatchEvent(new HashChangeEvent('hashchange')); }
    catch (err) { toast(err.message); btn.disabled = false; btn.textContent = '로그인'; }
  } }, field('이메일', email), field('비밀번호', pw), btn);
  return h('div', { class: 'admin-login' },
    h('div', { class: 'al-head' }, h('span', { class: 'al-tag' }, 'ADMIN'), h('h1', {}, '생활과학대학', h('br'), '시설 관리'), h('p', {}, '행정실·관리자 전용 페이지예요.')),
    form,
    h('a', { class: 'linkbtn center', href: '#/' }, '학생 화면으로'));
}

// ── 관리자 홈 ────────────────────────────────────────
function dashboard() {
  const s = session.get();
  const count = (label, href) => { const n = h('b', {}, '–'); return [h('a', { class: 'ad-stat', href }, h('small', {}, label), n), n]; };
  const [cReports, nReports] = count('새 신고', '#/admin/reports');
  const [cRentals, nRentals] = count('대여 대기', '#/admin/rentals');
  const [cOff, nOff] = count('오늘 휴강', '#/admin/rooms');
  (async () => {
    api.list().then(r => (nReports.textContent = r.filter(x => x.status === '미확인').length)).catch(() => {});
    db.list('rentals', { auth: true }).then(r => (nRentals.textContent = r.filter(x => x.status === '대기').length)).catch(() => {});
    db.list('schedule_exceptions').then(r => (nOff.textContent = r.filter(x => x.date === dateStr(new Date()) && x.kind === '휴강').length)).catch(() => {});
  })();
  const menu = (href, title, sub, color) => h('a', { class: 'ad-menu', href }, h('i', { style: `background:${color}` }), h('b', {}, title), h('small', {}, sub));
  return h('div', { class: 'admin-mode' },
    h('div', { class: 'ad-head' },
      h('div', { class: 'ad-top' }, h('div', {}, h('small', {}, s.email), h('h1', {}, '관리자 홈')),
        h('button', { class: 'ad-out', onClick: () => { logout(); location.hash = '#/admin'; dispatchEvent(new HashChangeEvent('hashchange')); } }, '로그아웃')),
      h('div', { class: 'ad-stats' }, cReports, cRentals, cOff)),
    h('div', { class: 'ad-grid' },
      menu('#/admin/reports', '신고 처리', '접수 · 처리 중 · 완료', 'var(--accent)'),
      menu('#/admin/rooms', '강의실·시간표', 'CSV 업로드 · 휴강 · 특강', '#0f766e'),
      menu('#/admin/amen', '편의시설', '평면도에 위치 찍기', '#b45309'),
      menu('#/admin/rentals', '대여 승인', '팀플 대여 신청', '#1f5fa8')),
    h('p', { class: 'hint center' }, h('a', { href: '#/', class: 'linkbtn' }, '학생 화면 보기')));
}

// ── 신고 처리 ────────────────────────────────────────
function reports() {
  let rows = [], status = '미확인';
  const list = h('div', { class: 'list' }, loading());
  const chips = h('div', { class: 'chips' });
  const paint = () => {
    fill(chips, ...['전체', ...STATUSES].map(s => h('button', { class: `chip ${status === s ? 'on' : ''}`, onClick: () => { status = s; paint(); } }, `${s} ${rows.filter(r => s === '전체' || r.status === s).length}`)));
    const shown = rows.filter(r => status === '전체' || r.status === status);
    fill(list, ...(shown.length ? shown.map(r => h('div', { class: 'card ad-report' },
      h('div', { class: 'row' }, h('span', { class: 'kind' }, r.kind), h('b', {}, r.locationLabel || '위치 정보 없음'), h('small', {}, ago(r.createdAt))),
      h('p', {}, r.detail),
      (r.photo || r.shot) ? h('div', { class: 'ad-imgs' }, [r.photo, r.shot].filter(Boolean).map(src => h('a', { href: src, target: '_blank', rel: 'noopener' }, h('img', { src, alt: '신고 사진', loading: 'lazy' })))) : null,
      h('div', { class: 'seg four' }, STATUSES.map(s => h('button', { class: s === r.status ? 'on' : '', onClick: async () => {
        try { await setReportStatus(r.id, s); r.status = s; paint(); toast(`'${s}'(으)로 바꿨어요.`); } catch (e) { toast(e.message); }
      } }, s))))) : [empty('해당하는 신고가 없어요')]));
  };
  api.list().then(r => { rows = r; paint(); }).catch(e => fill(list, empty('불러오지 못했어요', e.message)));
  return wrap(adminBar('신고 처리'), chips, list);
}

// ── 강의실·시간표 ─────────────────────────────────────
const TEMPLATE = '﻿강의실,요일,시작,끝,과목명\n305,월,09:00,10:15,가족관계론\n305,수,09:00,10:15,가족관계론\n306,목,13:30,16:15,식생활관리\n';
const DAY = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 7 };
function parseCSV(text) {
  const out = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.map(r => r.map(s => s.trim())).filter(r => r.some(Boolean));
}
const normTime = s => { const m = /^(\d{1,2})[:시.]?(\d{2})?/.exec(s.replace(/\s/g, '')); if (!m) return null; const hh = +m[1], mm = +(m[2] || 0); return hh < 24 && mm < 60 ? `${pad2(hh)}:${pad2(mm)}` : null; };
const normDay = s => DAY[s[0]] || (/^[1-7]$/.test(s) ? +s : null);
const guessFloor = code => (/^b/i.test(code) ? 'B1' : FLOOR_IDS.includes(code[0] + 'F') ? code[0] + 'F' : '1F');

function roomsAdmin() {
  const body = h('div', { class: 'pad' }, loading());
  const load = async () => {
    const [rooms, schedules] = await Promise.all([db.list('rooms'), db.list('schedules')]);
    const file = h('input', { type: 'file', accept: '.csv,text/csv,.tsv,.txt', hidden: true });
    const replace = h('input', { type: 'checkbox', checked: true });
    const result = h('div', { class: 'hint', style: 'margin:8px 0 0' });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      result.textContent = '읽는 중…';
      try {
        const rows = parseCSV(await f.text());
        if (rows.length && !normTime(rows[0][2] || '')) rows.shift(); // 머리줄
        const good = [], bad = [];
        rows.forEach((r, i) => {
          const [code, day, st, en, ...rest] = r, title = rest.join(',').trim();
          const w = normDay(day || ''), s = normTime(st || ''), e = normTime(en || '');
          if (!code || !w || !s || !e || s >= e || !title) bad.push(i + 2); else good.push({ code, weekday: w, start_time: s, end_time: e, title: title.slice(0, 80) });
        });
        if (!good.length) throw new Error('읽을 수 있는 줄이 없어요. 양식을 확인해 주세요.');
        const byCode = Object.fromEntries(rooms.map(r => [r.code, r]));
        const newCodes = [...new Set(good.map(g => g.code))].filter(c => !byCode[c]);
        if (newCodes.length) (await db.insert('rooms', newCodes.map(code => ({ code, floor: guessFloor(code), features: '', note: '', study_ok: true, rentable: true })))).forEach(r => (byCode[r.code] = r));
        const ids = [...new Set(good.map(g => byCode[g.code].id))];
        if (replace.checked) await db.removeByRooms('schedules', ids);
        const list = good.map(g => ({ room_id: byCode[g.code].id, weekday: g.weekday, start_time: g.start_time, end_time: g.end_time, title: g.title }));
        for (let i = 0; i < list.length; i += 500) await db.insert('schedules', list.slice(i, i + 500));
        toast(`시간표 ${list.length}개를 올렸어요.`);
        result.textContent = `${list.length}개 등록${newCodes.length ? ` · 새 강의실 ${newCodes.length}곳(${newCodes.join(', ')}) 추가 — 층이 맞는지 확인해 주세요` : ''}${bad.length ? ` · 건너뛴 줄: ${bad.slice(0, 12).join(', ')}${bad.length > 12 ? ' …' : ''}` : ''}`;
        await load(); body.querySelector('.csv-result')?.replaceWith(result);
      } catch (e) { result.textContent = ''; toast(e.message); }
      file.value = '';
    });
    const byFloor = FLOOR_IDS.filter(f => rooms.some(r => r.floor === f));
    fill(body, 
      h('div', { class: 'card csv' },
        h('b', {}, '학기 시간표 한 번에 올리기'),
        h('small', {}, '엑셀에서 CSV로 저장 · 열 순서: 강의실, 요일, 시작, 끝, 과목명'),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onClick: () => file.click() }, '파일 선택'),
          h('a', { class: 'btn ghost', href: 'data:text/csv;charset=utf-8,' + encodeURIComponent(TEMPLATE), download: '시간표_양식.csv' }, '양식 받기')),
        h('label', { class: 'check' }, replace, '올린 강의실의 기존 정규 시간표는 지우고 바꾸기'),
        file, h('div', { class: 'csv-result' }, result)),
      h('div', { class: 'ad-row' }, h('span', { class: 'lbl', style: 'margin:0' }, `강의실 ${rooms.length}곳`), h('button', { class: 'chip', onClick: () => roomForm(null, load) }, '+ 강의실 추가')),
      rooms.length ? byFloor.map(f => h('div', { class: 'ad-floor' }, h('small', {}, f),
        rooms.filter(r => r.floor === f).map(r => h('a', { class: 'am-item', href: `#/admin/room/${r.id}` },
          h('b', { class: 'code' }, roomName(r)),
          h('div', {}, h('b', {}, `수업 ${schedules.filter(s => s.room_id === r.id).length}개`), h('small', {}, [r.seats ? `${r.seats}석` : null, r.x != null ? '평면도 위치 있음' : null, !r.study_ok ? '자습 닫힘' : null, !r.rentable ? '대여 안 받음' : null].filter(Boolean).join(' · ') || ' ')),
          h('svg', { class: 'hub-go', viewBox: '0 0 24 24' }, h('path', { d: 'M9 6l6 6-6 6' })))))) : empty('강의실이 없어요', 'CSV를 올리거나 강의실을 직접 추가해 주세요.'),
    );
  };
  load().catch(e => fill(body, empty('불러오지 못했어요', e.message)));
  return wrap(adminBar('강의실·시간표'), body);
}

// 강의실 정보 추가/수정 시트
function roomForm(room, done) {
  const f = {
    code: input({ value: room?.code || '', maxlength: 20, placeholder: '예: 305' }),
    floor: select(FLOOR_IDS, room?.floor || '1F'),
    seats: input({ type: 'number', min: 0, max: 1000, value: room?.seats ?? '', inputmode: 'numeric' }),
    features: input({ value: room?.features || '', maxlength: 200, placeholder: '빔프로젝터, 화이트보드, 콘센트 많음' }),
    note: input({ value: room?.note || '', maxlength: 200, placeholder: '학생에게 보여 줄 안내 (선택)' }),
    study: h('input', { type: 'checkbox', checked: room ? room.study_ok : true }),
    rent: h('input', { type: 'checkbox', checked: room ? room.rentable : true }),
  };
  f.code.addEventListener('input', () => { if (!room) f.floor.value = guessFloor(f.code.value.trim() || '1'); });
  openSheet(close => [
    h('h2', { style: 'font-size:18px;margin-bottom:12px' }, room ? '강의실 정보 수정' : '강의실 추가'),
    h('div', { class: 'form tight' },
      h('div', { class: 'two' }, field('호실', f.code), field('층', f.floor)),
      field('좌석 수', f.seats), field('시설', f.features, '쉼표로 구분'), field('안내', f.note),
      h('label', { class: 'check' }, f.study, '빈 시간에 학생 자습 가능으로 보여 주기'),
      h('label', { class: 'check' }, f.rent, '팀플 대여 신청 받기'),
      h('button', { class: 'btn block', onClick: async () => {
        const row = { code: f.code.value.trim(), floor: f.floor.value, seats: f.seats.value === '' ? null : Math.max(0, parseInt(f.seats.value, 10) || 0), features: f.features.value.trim(), note: f.note.value.trim(), study_ok: f.study.checked, rentable: f.rent.checked };
        if (!row.code) return toast('호실을 적어 주세요.');
        try {
          if (room && room.floor !== row.floor) Object.assign(row, { x: null, y: null }); // 층이 바뀌면 평면도 위치는 다시 찍어야 한다
          room ? await db.update('rooms', room.id, row) : await db.insert('rooms', [row]);
          close(); toast('저장했어요.'); done?.();
        } catch (e) { toast(/duplicate|unique/i.test(e.message) ? '같은 호실이 이미 있어요.' : e.message); }
      } }, '저장')),
  ], { label: '강의실' });
}

function roomEditor(id) {
  const body = h('div', { class: 'pad' }, loading());
  const bar = adminBar('강의실', '#/admin/rooms');
  const load = async () => {
    const [rooms, schedules, exceptions] = await Promise.all([db.list('rooms'), db.list('schedules'), db.list('schedule_exceptions')]);
    const room = rooms.find(r => r.id === id);
    if (!room) return fill(body, empty('없는 강의실이에요'));
    bar.querySelector('h1').textContent = `${roomName(room)} · ${room.floor}`;
    const mine = schedules.filter(s => s.room_id === id);
    const today = dateStr(new Date());
    const exc = exceptions.filter(e => e.room_id === id && e.date >= today);

    // 정규 시간표 추가
    const s = { wd: select(WEEKDAYS.map((d, i) => [i + 1, d]), 1), st: timeSel('09:00'), en: timeSel('10:30'), title: input({ maxlength: 80, placeholder: '과목명' }) };
    const addSched = h('button', { class: 'btn', onClick: async () => {
      const row = { room_id: id, weekday: +s.wd.value, start_time: s.st.value, end_time: s.en.value, title: s.title.value.trim() };
      if (!row.title) return toast('과목명을 적어 주세요.');
      if (row.start_time >= row.end_time) return toast('끝나는 시간이 시작보다 늦어야 해요.');
      try { await db.insert('schedules', [row]); toast('추가했어요.'); load(); } catch (e) { toast(e.message); }
    } }, '추가');
    // 휴강·보강·특강 추가
    const x = { date: input({ type: 'date', value: today, min: today }), kind: select(['휴강', '보강', '특강'], '휴강'), st: timeSel('09:00'), en: timeSel('10:30'), title: input({ maxlength: 80, placeholder: '이름 (휴강이면 비워도 돼요)' }) };
    const addExc = h('button', { class: 'btn', onClick: async () => {
      const row = { room_id: id, date: x.date.value, kind: x.kind.value, start_time: x.st.value, end_time: x.en.value, title: x.title.value.trim() };
      if (!row.date) return toast('날짜를 골라 주세요.');
      if (row.start_time >= row.end_time) return toast('끝나는 시간이 시작보다 늦어야 해요.');
      try { await db.insert('schedule_exceptions', [row]); toast('등록했어요. 학생 화면에 바로 반영돼요.'); load(); } catch (e) { toast(e.message); }
    } }, '등록');

    // 평면도 위치
    const plan = await loadPlan(room.floor);
    let posBox;
    if (plan) {
      let pending = room.x != null ? { x: room.x, y: room.y } : null;
      const saveBtn = h('button', { class: 'btn', disabled: true, onClick: async () => {
        try { await db.update('rooms', id, pending || { x: null, y: null }); toast('위치를 저장했어요.'); load(); } catch (e) { toast(e.message); }
      } }, '위치 저장');
      const mk = () => (pending ? [{ id, x: pending.x, y: pending.y, text: room.code.slice(-3), color: '#0f766e' }] : []);
      const map = planView(plan, { markers: mk(), hint: '강의실 문 앞을 눌러 위치를 정해 주세요', onTap: (px, py) => { pending = { x: px, y: py }; map.setMarkers(mk()); saveBtn.disabled = false; } });
      posBox = h('div', {}, map, h('div', { class: 'row gap' }, saveBtn,
        room.x != null ? h('button', { class: 'btn ghost', onClick: confirmDo('평면도 위치를 지울까요?', async () => { await db.update('rooms', id, { x: null, y: null }); load(); }) }, '위치 지우기') : null));
    } else posBox = noPlan('도면이 없는 층이라 위치 없이 목록으로만 보여요.');

    fill(body, 
      h('div', { class: 'card ad-info' },
        h('div', {}, h('b', {}, roomName(room)), h('small', {}, [room.floor, room.seats ? `${room.seats}석` : null, room.features || null].filter(Boolean).join(' · '))),
        h('button', { class: 'chip', onClick: () => roomForm(room, load) }, '수정')),

      h('span', { class: 'lbl sec' }, '정규 시간표 (매주 반복)'),
      h('div', { class: 'card' },
        mine.length ? WEEKDAYS.map((d, i) => { const day = mine.filter(m => +m.weekday === i + 1); return day.length ? h('div', { class: 'wk' }, h('b', {}, d),
          h('div', {}, day.map(m => h('div', { class: 'wk-row' }, h('span', {}, `${m.start_time}–${m.end_time}`), h('span', { class: 'n' }, m.title),
            h('button', { class: 'x', 'aria-label': '삭제', onClick: confirmDo(`${d} ${m.start_time} ${m.title} 수업을 지울까요?`, async () => { await db.remove('schedules', m.id); load(); }) }, '×'))))) : null; })
          : h('p', { class: 'hint', style: 'margin:0' }, '등록된 수업이 없어요.'),
        h('div', { class: 'add' }, h('div', { class: 'three' }, s.wd, s.st, s.en), h('div', { class: 'row gap' }, s.title, addSched))),

      h('span', { class: 'lbl sec' }, '휴강 · 보강 · 특강 (그날만)'),
      h('div', { class: 'card' },
        exc.length ? exc.map(e => h('div', { class: 'wk-row' }, h('span', { class: `kd k-${e.kind}` }, e.kind), h('span', {}, `${dateLabel(e.date)} ${e.start_time}–${e.end_time}`), h('span', { class: 'n' }, e.title),
          h('button', { class: 'x', 'aria-label': '삭제', onClick: confirmDo('이 일정을 지울까요?', async () => { await db.remove('schedule_exceptions', e.id); load(); }) }, '×')))
          : h('p', { class: 'hint', style: 'margin:0' }, '앞으로 예정된 변경이 없어요.'),
        h('div', { class: 'add' }, h('div', { class: 'two' }, x.date, x.kind), h('div', { class: 'two' }, x.st, x.en), h('div', { class: 'row gap' }, x.title, addExc))),

      h('span', { class: 'lbl sec' }, '평면도 위치'),
      posBox,

      h('button', { class: 'btn block ghost danger', style: 'margin-top:24px', onClick: confirmDo(`${roomName(room)}을(를) 삭제할까요? 시간표와 대여 기록도 같이 지워져요.`, async () => { try { await db.remove('rooms', id); toast('삭제했어요.'); location.hash = '#/admin/rooms'; } catch (e) { toast(e.message); } }) }, '강의실 삭제'),
    );
  };
  load().catch(e => fill(body, empty('불러오지 못했어요', e.message)));
  return wrap(bar, body);
}

// ── 편의시설 ─────────────────────────────────────────
let amenFloor = '1F';
function amenAdmin() {
  const body = h('div', {}, loading());
  let moving = null; // 위치를 옮기는 중인 편의시설
  const load = async () => {
    const [all, plan] = await Promise.all([db.list('amenities'), loadPlan(amenFloor)]);
    const items = all.filter(a => a.floor === amenFloor);
    const banner = h('div', { class: 'move-banner', hidden: !moving }, moving ? `'${moving.label || moving.category}' 새 위치를 평면도에서 눌러 주세요` : '', h('button', { class: 'linkbtn', onClick: () => { moving = null; load(); } }, '취소'));
    const mks = items.map(a => { const t = amenityType(a.category); return { id: a.id, x: a.x, y: a.y, text: t.short, color: t.color, ring: moving?.id === a.id ? '#1d1f27' : null }; });
    const map = plan
      ? planView(plan, {
          markers: mks, hint: '빈 곳을 누르면 새 시설 추가 · 표시를 누르면 수정',
          onMarker: m => { if (!moving) amenForm(items.find(a => a.id === m.id), load, setMove); },
          onTap: async (x, y) => {
            if (moving) { try { await db.update('amenities', moving.id, { x, y }); toast('위치를 옮겼어요.'); } catch (e) { toast(e.message); } moving = null; return load(); }
            amenForm({ floor: amenFloor, x, y }, load, setMove);
          } })
      : noPlan('도면이 없는 층이에요. 위치 설명을 적어서 목록으로 등록할 수 있어요.');
    fill(body, 
      floorChips(amenFloor, f => { amenFloor = f; moving = null; load(); }),
      banner, map,
      h('div', { class: 'ad-row pad0' }, h('span', { class: 'lbl', style: 'margin:0' }, `${amenFloor} · ${items.length}곳`), h('button', { class: 'chip', onClick: () => amenForm({ floor: amenFloor }, load, setMove) }, plan ? '+ 위치 없이 추가' : '+ 추가')),
      h('div', { class: 'am-list' }, items.map(a => { const t = amenityType(a.category); return h('button', { class: 'am-item', onClick: () => amenForm(a, load, setMove) },
        h('i', { class: 'ic', style: `background:${t.color}` }, t.short), h('div', {}, h('b', {}, a.label || a.category), h('small', {}, [a.location, a.x == null && plan ? '평면도 위치 없음' : null].filter(Boolean).join(' · ') || ' ')),
        h('svg', { class: 'hub-go', viewBox: '0 0 24 24' }, h('path', { d: 'M9 6l6 6-6 6' }))); })),
    );
  };
  const setMove = a => { moving = a; load(); };
  load().catch(e => fill(body, empty('불러오지 못했어요', e.message)));
  return wrap(adminBar('편의시설 관리'), body);
}

function amenForm(a, done, onMove) {
  const isNew = !a.id;
  let cat = a.category || AMENITY_TYPES[0].id;
  // 세부정보: 저장된 값 + 종류별 기본 항목
  let details = Array.isArray(a.details) ? a.details.map(([k, v]) => [k, v]) : [];
  const fillTemplate = () => { for (const k of amenityType(cat).details) if (!details.some(d => d[0] === k)) details.push([k, '']); };
  fillTemplate();
  const label = input({ value: a.label || '', maxlength: 40, placeholder: '예: 여자 화장실 (비우면 종류 이름)' });
  const loc = input({ value: a.location || '', maxlength: 80, placeholder: '예: 계단 옆, 201호 맞은편' });
  openSheet((close, repaint) => [
    h('h2', { style: 'font-size:18px;margin-bottom:10px' }, isNew ? `${a.floor} 편의시설 추가` : '편의시설 수정'),
    h('span', { class: 'lbl' }, '종류'),
    h('div', { class: 'cat-grid small' }, AMENITY_TYPES.map(t => h('button', { class: `cat ${t.id === cat ? 'on' : ''}`, style: t.id === cat ? `background:${t.color};border-color:${t.color}` : '',
      onClick: () => { cat = t.id; details = details.filter(([, v]) => String(v).trim()); fillTemplate(); repaint(); } }, h('i', { class: 'ic', style: `background:${t.color}` }, t.short), h('span', {}, t.id)))),
    h('div', { class: 'form tight', style: 'margin-top:12px' },
      field('이름', label), field('위치 설명', loc),
      h('span', { class: 'lbl', style: 'margin-bottom:0' }, '세부정보 (학생이 눌렀을 때 보여요 · 빈 칸은 안 보여요)'),
      h('div', { class: 'kv-edit' }, details.map((d, i) => h('div', { class: 'two kv-row' },
        h('input', { class: 'in', value: d[0], maxlength: 20, placeholder: '항목', onInput: e => (d[0] = e.target.value) }),
        h('div', { class: 'row gap' }, h('input', { class: 'in', value: d[1], maxlength: 60, placeholder: '내용', onInput: e => (d[1] = e.target.value) }),
          h('button', { class: 'x', 'aria-label': '항목 삭제', onClick: () => { details.splice(i, 1); repaint(); } }, '×'))))),
      h('button', { class: 'linkbtn', style: 'text-align:left', onClick: () => { details.push(['', '']); repaint(); } }, '+ 항목 추가'),
      a.x != null ? h('small', { class: 'note' }, '평면도에 찍은 위치로 저장돼요.') : null,
      h('button', { class: 'btn block', onClick: async () => {
        const row = { floor: a.floor, category: cat, label: label.value.trim(), location: loc.value.trim(), details: details.map(([k, v]) => [String(k).trim(), String(v).trim()]).filter(([k, v]) => k && v) };
        if (isNew) Object.assign(row, { x: a.x ?? null, y: a.y ?? null });
        try { isNew ? await db.insert('amenities', [row]) : await db.update('amenities', a.id, row); close(); toast('저장했어요.'); done(); } catch (e) { toast(e.message); }
      } }, '저장'),
      !isNew ? h('div', { class: 'two' },
        h('button', { class: 'btn ghost', onClick: () => { close(); onMove(a); } }, a.x != null ? '위치 옮기기' : '평면도에 찍기'),
        h('button', { class: 'btn ghost danger', onClick: confirmDo('이 편의시설을 삭제할까요?', async () => { try { await db.remove('amenities', a.id); close(); toast('삭제했어요.'); done(); } catch (e) { toast(e.message); } }) }, '삭제')) : null),
  ], { label: '편의시설' });
}

// ── 대여 승인 ────────────────────────────────────────
function rentalsAdmin() {
  let tab = '대기';
  const body = h('div', { class: 'list' }, loading());
  const chips = h('div', { class: 'chips' });
  const load = async () => {
    const [rentals, rooms, schedules, exceptions] = await Promise.all([db.list('rentals', { auth: true }), db.list('rooms'), db.list('schedules'), db.list('schedule_exceptions')]);
    const roomOf = id => rooms.find(r => r.id === id);
    const approved = rentals.filter(r => r.status === '승인');
    const paint = () => {
      fill(chips, ...['대기', '승인', '거절'].map(s => h('button', { class: `chip ${tab === s ? 'on' : ''}`, onClick: () => { tab = s; paint(); } }, `${s} ${rentals.filter(r => r.status === s).length}`)));
      const shown = rentals.filter(r => r.status === tab).sort((a, b) => (a.date + a.start_time < b.date + b.start_time ? -1 : 1));
      fill(body, ...(shown.length ? shown.map(r => {
        // 겹치는 일정: 수업·특강 + 이미 승인된 다른 대여
        const data = { schedules, exceptions, slots: approved.filter(x => x.id !== r.id) };
        const clash = busySegments(r.room_id, r.date, data).filter(s => overlaps(s, r));
        const past = r.date < dateStr(new Date());
        const set = async (status, note) => { try { await db.update('rentals', r.id, { status, admin_note: note ?? r.admin_note }); toast(`${status}했어요.`); load(); } catch (e) { toast(e.message); } };
        return h('div', { class: 'card ad-rent' },
          h('div', { class: 'row' }, h('b', { class: 'big' }, roomName(roomOf(r.room_id))),
            clash.length ? h('span', { class: 'pill warn' }, `겹침: ${clash.map(s => `${s.start_time} ${s.title}`).join(', ')}`) : h('span', { class: 'pill ok' }, '시간 겹침 없음')),
          h('dl', {},
            h('dt', {}, '일시'), h('dd', {}, h('b', {}, `${dateLabel(r.date)} ${r.start_time}–${r.end_time}`), past ? ' (지난 날짜)' : ''),
            h('dt', {}, '신청자'), h('dd', {}, [r.name, r.dept].filter(Boolean).join(' · ')),
            h('dt', {}, '연락처'), h('dd', {}, r.contact),
            h('dt', {}, '인원'), h('dd', {}, `${r.people}명`),
            r.purpose ? [h('dt', {}, '목적'), h('dd', {}, r.purpose)] : null,
            r.admin_note ? [h('dt', {}, '메모'), h('dd', {}, r.admin_note)] : null),
          h('small', { class: 'note' }, `신청 ${ago(r.created_at)}`),
          r.status === '대기' ? h('div', { class: 'two' },
            h('button', { class: 'btn ghost', onClick: () => { const n = prompt('거절 사유 (신청자에게 연락할 때 참고, 선택)', ''); if (n !== null) set('거절', n.slice(0, 200)); } }, '거절'),
            h('button', { class: 'btn', onClick: () => (!clash.length || confirm('다른 일정과 겹쳐요. 그래도 승인할까요?')) && set('승인') }, '승인'))
            : h('button', { class: 'btn ghost block', onClick: confirmDo(r.status === '승인' ? '승인을 취소하고 대기로 돌릴까요?' : '대기로 돌릴까요?', () => set('대기')) }, '대기로 돌리기'));
      }) : [empty(`${tab} 중인 신청이 없어요`)]));
    };
    paint();
  };
  load().catch(e => fill(body, empty('불러오지 못했어요', e.message)));
  return wrap(adminBar('대여 승인'), chips, body);
}
