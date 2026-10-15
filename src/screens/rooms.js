import { h, toast } from '../lib/dom.js';
import { db } from '../lib/db.js';
import { OFFICE, FLOORS } from '../data/config.js';
import { fill, topbar, floorChips, openSheet, field, input, select, empty, loading } from '../lib/ui.js';
import { loadPlan, planView } from '../lib/floorplan.js';
import { dateStr, timeStr, dateLabel, dur, HALF_HOURS, roomStatus, busySegments, cancelledSegments, overlaps, toMin, fromMin } from '../lib/timetable.js';

// 화면을 오가도 고른 날짜·시간·층을 기억한다
const pick = { date: null, time: null, floor: null, view: 'list' };
const nowPick = () => { const n = new Date(); return { date: dateStr(n), time: timeStr(n) }; };
const current = () => ({ date: pick.date || nowPick().date, time: pick.time || nowPick().time });

async function loadAll() {
  const [rooms, schedules, exceptions, slots] = await Promise.all(['rooms', 'schedules', 'schedule_exceptions', 'rental_slots'].map(t => db.list(t)));
  return { rooms, data: { schedules, exceptions, slots } };
}

const STATE_TEXT = { busy: '사용 중', soon: '곧 수업', free: '자습 가능' };
function describe(room, st) {
  if (st.state === 'busy') return { cls: 'busy', top: st.seg.kind === '대여' ? '대여 중' : st.seg.kind === '수업' ? '수업 중' : st.seg.kind, sub: `${st.seg.title} · ~${st.seg.end_time}` };
  if (!room.study_ok) return { cls: 'closed', top: '비어 있음', sub: '자습 개방 안 함' };
  if (st.state === 'soon') return { cls: 'soon', top: STATE_TEXT.soon, sub: `${st.next.start_time} ${st.next.title}` };
  return { cls: 'free', top: STATE_TEXT.free, sub: st.left == null ? '이날 남은 수업 없음' : `${dur(st.left)} 비어요` };
}

// ── 목록 ─────────────────────────────────────────────
export function rooms() {
  const root = h('div', {}, topbar('빈 강의실', '#/'));
  const body = h('div', {}, loading());
  root.append(body);

  loadAll().then(({ rooms, data }) => {
    if (!rooms.length) return fill(body, empty('아직 등록된 강의실이 없어요', '행정실에서 강의실과 시간표를 등록하면 여기에 보여요.'));
    const floors = FLOORS.map(f => f.id).filter(id => rooms.some(r => r.floor === id));
    if (!floors.includes(pick.floor)) pick.floor = floors.includes('1F') ? '1F' : floors[0];
    const paint = async () => {
      const { date, time } = current();
      const onFloor = rooms.filter(r => r.floor === pick.floor);
      const info = onFloor.map(r => ({ r, d: describe(r, roomStatus(r.id, date, time, data)) }));
      const freeN = info.filter(x => x.d.cls === 'free' || x.d.cls === 'soon').length;

      const dIn = input({ type: 'date', value: date, 'aria-label': '날짜', onChange: e => { pick.date = e.target.value || null; pick.time ||= time; paint(); } });
      const tIn = select(HALF_HOURS.includes(time) ? HALF_HOURS : [time, ...HALF_HOURS], time, { 'aria-label': '시간', onChange: e => { pick.time = e.target.value; pick.date ||= date; paint(); } });
      const isNow = !pick.date && !pick.time;
      const timebar = h('div', { class: 'timebar' },
        h('div', { class: 'tb-lbl' }, h('small', {}, isNow ? '지금 기준' : '보고 싶은 시간'), h('b', {}, `${dateLabel(date)} ${time}`)),
        h('div', { class: 'tb-in' }, dIn, tIn, h('button', { class: `chip ${isNow ? 'on' : ''}`, onClick: () => { pick.date = pick.time = null; paint(); } }, '지금')));

      const plan = await loadPlan(pick.floor);
      const placed = onFloor.filter(r => r.x != null && r.y != null);
      const canPlan = plan && placed.length;
      const viewSeg = canPlan ? h('div', { class: 'seg small' }, ...[['list', '목록'], ['plan', '평면도']].map(([v, t]) => h('button', { class: pick.view === v ? 'on' : '', onClick: () => { pick.view = v; paint(); } }, t))) : null;

      let main;
      if (canPlan && pick.view === 'plan') {
        const COLOR = { busy: '#8a1f3d', soon: '#b45309', free: '#0f766e', closed: '#6b6f7b' };
        main = planView(plan, {
          markers: info.filter(x => x.r.x != null).map(({ r, d }) => ({ id: r.id, x: r.x, y: r.y, text: r.code.slice(-3), color: COLOR[d.cls], label: d.top })),
          onMarker: m => (location.hash = `#/room/${m.id}`),
        });
      } else {
        main = h('div', { class: 'room-grid' }, info.map(({ r, d }) => h('a', { class: `room-card ${d.cls}`, href: `#/room/${r.id}` },
          h('b', {}, r.code.match(/^\d/) ? r.code + '호' : r.code), h('span', { class: 'st' }, d.top), h('small', {}, d.sub))));
      }
      fill(body, 
        timebar,
        floorChips(pick.floor, f => { pick.floor = f; paint(); }, { only: floors }),
        h('div', { class: 'room-sum' }, h('span', {}, `${pick.floor} · 이 시간 자습 가능 `, h('b', {}, `${freeN}곳`)), viewSeg),
        main,
        h('div', { class: 'legend' }, ['busy:수업·대여 중', 'soon:1시간 내 수업', 'free:자습 가능'].map(s => { const [c, t] = s.split(':'); return h('span', {}, h('i', { class: `lg-${c}` }), t); })),
        h('p', { class: 'hint center' }, '팀플용으로 쓰고 싶으면 강의실을 눌러 대여 신청을 할 수 있어요.'),
      );
    };
    paint();
  }).catch(e => fill(body, empty('불러오지 못했어요', e.message)));
  return root;
}

// ── 강의실 상세 ───────────────────────────────────────
export function roomDetail(id) {
  const root = h('div', {}, topbar('강의실', '#/rooms'));
  const body = h('div', { class: 'pad' }, loading());
  root.append(body);

  loadAll().then(({ rooms, data }) => {
    const room = rooms.find(r => r.id === id);
    if (!room) return fill(body, empty('없는 강의실이에요'));
    root.querySelector('.topbar h1').textContent = `${room.code.match(/^\d/) ? room.code + '호' : room.code} · ${room.floor}`;
    const paint = () => {
      const { date, time } = current();
      const d = describe(room, roomStatus(room.id, date, time, data));
      const segs = busySegments(room.id, date, data), cancelled = cancelledSegments(room.id, date, data);
      // 08:00~22:00 사이 빈 시간도 같이 보여 준다
      const rows = []; let cur = '08:00';
      for (const s of segs) { if (s.start_time > cur) rows.push({ start_time: cur, end_time: s.start_time, free: true }); rows.push(s); if (s.end_time > cur) cur = s.end_time; }
      if (cur < '22:00') rows.push({ start_time: cur, end_time: '22:00', free: true });
      const shift = n => { const [y, m, dd] = date.split('-').map(Number); pick.date = dateStr(new Date(y, m - 1, dd + n)); pick.time ||= time; paint(); };

      fill(body, 
        h('div', { class: `room-hero ${d.cls}` }, h('small', {}, `${dateLabel(date)} ${time} 기준`), h('b', {}, d.top), h('span', {}, d.sub)),
        h('div', { class: 'day-nav' },
          h('button', { class: 'iconbtn', 'aria-label': '전날', onClick: () => shift(-1) }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M15 5l-7 7 7 7' }))),
          h('b', {}, `${dateLabel(date)} 시간표`),
          h('button', { class: 'iconbtn', 'aria-label': '다음날', onClick: () => shift(1) }, h('svg', { viewBox: '0 0 24 24' }, h('path', { d: 'M9 5l7 7-7 7' })))),
        h('div', { class: 'card tt' },
          rows.map(s => h('div', { class: `tt-row ${s.free ? 'free' : ''} ${s.start_time <= time && time < s.end_time ? 'now' : ''}` },
            h('span', { class: 't' }, `${s.start_time}–${s.end_time}`),
            h('span', { class: 'k' }, s.free ? (room.study_ok ? '비어 있음' : '빈 시간') : s.kind),
            h('span', { class: 'n' }, s.free ? '' : s.title))),
          cancelled.map(s => h('div', { class: 'tt-row off' }, h('span', { class: 't' }, `${s.start_time}–${s.end_time}`), h('span', { class: 'k' }, '휴강'), h('span', { class: 'n' }, s.title)))),
        h('span', { class: 'lbl', style: 'margin-top:16px' }, '강의실 정보'),
        h('div', { class: 'tags' },
          room.seats ? h('span', {}, `${room.seats}석`) : null,
          ...room.features.split(',').map(s => s.trim()).filter(Boolean).map(s => h('span', {}, s)),
          room.study_ok ? h('span', {}, '빈 시간 자습 가능') : h('span', {}, '자습 개방 안 함')),
        room.note ? h('p', { class: 'hint', style: 'margin:8px 0 0' }, room.note) : null,
        h('div', { class: 'room-cta' },
          room.rentable ? h('button', { class: 'btn block', onClick: () => rentalForm(room, data, date) }, '팀플용 대여 신청') : h('p', { class: 'hint center' }, '이 강의실은 대여 신청을 받지 않아요.'),
          OFFICE.phone ? h('a', { class: 'btn block ghost', href: `tel:${OFFICE.phone}` }, `${OFFICE.name}에 문의하기`) : null),
      );
    };
    paint();
  }).catch(e => fill(body, empty('불러오지 못했어요', e.message)));
  return root;
}

// ── 대여 신청 ─────────────────────────────────────────
function rentalForm(room, data, date) {
  const nowT = timeStr(new Date());
  const startDefault = HALF_HOURS.find(t => t >= nowT) || '09:00';
  const f = {
    date: input({ type: 'date', value: date, min: dateStr(new Date()), required: true }),
    start: select(HALF_HOURS, startDefault),
    end: select(HALF_HOURS, fromMin(Math.min(toMin(startDefault) + 120, toMin('23:00')))),
    name: input({ maxlength: 40, placeholder: '대표자 이름', autocomplete: 'name' }),
    dept: input({ maxlength: 40, placeholder: '학과' }),
    contact: input({ maxlength: 60, placeholder: '연락받을 전화번호 또는 이메일' }),
    people: input({ type: 'number', min: 1, max: 200, value: 4, inputmode: 'numeric' }),
    purpose: h('textarea', { class: 'in', maxlength: 300, placeholder: '예: 전공 팀플 발표 준비', style: 'min-height:80px' }),
  };
  const warn = h('div', { class: 'warn', hidden: true });
  const check = () => {
    const want = { start_time: f.start.value, end_time: f.end.value };
    const clash = f.date.value && want.start_time < want.end_time ? busySegments(room.id, f.date.value, data).filter(s => overlaps(s, want)) : [];
    warn.hidden = !clash.length;
    warn.textContent = clash.length ? `이 시간에 ${clash.map(s => `${s.start_time}–${s.end_time} ${s.title}`).join(', ')} 일정이 있어요. 겹치면 승인되기 어려워요.` : '';
  };
  [f.date, f.start, f.end].forEach(el => el.addEventListener('change', check));
  check();
  openSheet(close => {
    const submit = h('button', { class: 'btn block', onClick: async () => {
      const row = { room_id: room.id, date: f.date.value, start_time: f.start.value, end_time: f.end.value, name: f.name.value.trim(), dept: f.dept.value.trim(), contact: f.contact.value.trim(), people: Math.max(1, Math.min(200, parseInt(f.people.value, 10) || 1)), purpose: f.purpose.value.trim() };
      if (!row.date) return toast('날짜를 골라 주세요.');
      if (row.start_time >= row.end_time) return toast('끝나는 시간이 시작보다 늦어야 해요.');
      if (!row.name || !row.contact) return toast('이름과 연락처를 적어 주세요.');
      submit.disabled = true; submit.textContent = '신청 중…';
      try { await db.insert('rentals', [row], { auth: false }); close(); toast('신청했어요. 행정실에서 승인하면 연락드려요.'); }
      catch (e) { toast(e.message); submit.disabled = false; submit.textContent = '신청하기'; }
    } }, '신청하기');
    return [
      h('h2', { style: 'font-size:18px' }, `${room.code.match(/^\d/) ? room.code + '호' : room.code} 팀플 대여 신청`),
      h('p', { class: 'hint', style: 'margin:4px 0 12px' }, '행정실에서 확인한 뒤 승인돼요. 승인되면 빈 강의실 화면에 "대여 중"으로 표시돼요.'),
      h('div', { class: 'form tight' },
        field('날짜', f.date),
        h('div', { class: 'two' }, field('시작', f.start), field('끝', f.end)),
        warn,
        h('div', { class: 'two' }, field('이름', f.name), field('학과', f.dept)),
        field('연락처', f.contact, '승인 결과를 알려 드릴 때만 써요. 행정실만 볼 수 있어요.'),
        field('인원', f.people),
        field('사용 목적', f.purpose),
        submit),
    ];
  }, { label: '대여 신청' });
}
