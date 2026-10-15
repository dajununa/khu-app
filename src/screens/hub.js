import { h } from '../lib/dom.js';
import { db } from '../lib/db.js';
import { dateStr, timeStr, roomStatus } from '../lib/timetable.js';

const icon = (d, color) => h('svg', { viewBox: '0 0 24 24', style: `stroke:${color}` }, ...[].concat(d).map(p => h('path', { d: p })));

// 첫 화면: 세 기능으로 나뉘는 입구
export function hub() {
  const freeBadge = h('span', { class: 'hub-badge', hidden: true });
  const card = (href, cls, svg, title, sub, extra) => h('a', { class: `hub-card ${cls}`, href },
    h('div', { class: 'hub-ic' }, svg),
    h('div', { class: 'hub-tx' }, h('b', {}, title), h('span', {}, sub)),
    extra || h('svg', { class: 'hub-go', viewBox: '0 0 24 24' }, h('path', { d: 'M9 6l6 6-6 6' })));

  // 지금 자습 가능한 강의실 수 (데이터가 없거나 실패하면 표시하지 않음)
  (async () => {
    try {
      const [rooms, schedules, exceptions, slots] = await Promise.all(['rooms', 'schedules', 'schedule_exceptions', 'rental_slots'].map(t => db.list(t)));
      const now = new Date(), ds = dateStr(now), t = timeStr(now), data = { schedules, exceptions, slots };
      const n = rooms.filter(r => r.study_ok && roomStatus(r.id, ds, t, data).state !== 'busy').length;
      if (rooms.length) { freeBadge.textContent = `지금 ${n}곳`; freeBadge.hidden = false; }
    } catch {}
  })();

  const now = new Date();
  return h('div', { class: 'hub' },
    h('div', { class: 'hub-head' },
      h('div', { class: 'kicker' }, '경희대학교'),
      h('h1', {}, '생활과학대학'),
      h('div', { class: 'hub-date' }, `${now.getMonth() + 1}월 ${now.getDate()}일 ${'일월화수목금토'[now.getDay()]}요일`)),
    h('div', { class: 'hub-list' },
      card('#/fix', 'c-fix', icon(['M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z', 'M12 7v4', 'M12 14h.01'], 'var(--accent)'), '고장 신고', '평면도·3D 스캔에서 위치를 찍어 신고'),
      card('#/rooms', 'c-room', icon(['M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16', 'M2 21h20', 'M15 12h.01'], '#0f766e'), '빈 강의실', '자습 가능한 강의실 · 팀플 대여 신청', freeBadge),
      card('#/amen', 'c-amen', icon(['M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z'], '#b45309'), '편의시설', '화장실 · 정수기 · 취식 공간 위치'),
    ),
  );
}
