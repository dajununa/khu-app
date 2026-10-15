// 강의실 사용 여부 계산. 시각은 'HH:MM' 문자열(같은 길이라 문자열 비교로 크기 비교가 된다).
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']; // weekday 1..7

export const pad2 = n => String(n).padStart(2, '0');
export const dateStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const timeStr = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const weekdayOf = ds => { const [y, m, d] = ds.split('-').map(Number); return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1; };
export const toMin = t => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
export const fromMin = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
export const overlaps = (a, b) => a.start_time < b.end_time && b.start_time < a.end_time;
export function dateLabel(ds) {
  const [, m, d] = ds.split('-').map(Number);
  const today = dateStr(new Date());
  return `${ds === today ? '오늘' : `${m}/${d}`}(${WEEKDAYS[weekdayOf(ds) - 1]})`;
}
export function dur(min) {
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh && mm ? `${hh}시간 ${mm}분` : hh ? `${hh}시간` : `${mm}분`;
}
// 30분 단위 시간 목록 (보기·신청 시간 고르기)
export const HALF_HOURS = Array.from({ length: (23 - 7) * 2 + 1 }, (_, i) => fromMin(7 * 60 + i * 30));

// 그날 그 강의실을 쓰는 시간들. data = { schedules, exceptions, slots }
export function busySegments(roomId, ds, data) {
  const wd = weekdayOf(ds);
  const exc = data.exceptions.filter(e => e.room_id === roomId && e.date === ds);
  const off = exc.filter(e => e.kind === '휴강');
  const segs = [];
  for (const s of data.schedules) {
    if (s.room_id !== roomId || +s.weekday !== wd) continue;
    if (off.some(o => overlaps(o, s))) continue; // 휴강으로 빠진 수업
    segs.push({ start_time: s.start_time, end_time: s.end_time, kind: '수업', title: s.title });
  }
  for (const e of exc) if (e.kind !== '휴강') segs.push({ start_time: e.start_time, end_time: e.end_time, kind: e.kind, title: e.title || e.kind });
  for (const r of data.slots) if (r.room_id === roomId && r.date === ds) segs.push({ start_time: r.start_time, end_time: r.end_time, kind: '대여', title: '팀플 대여' });
  return segs.sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
}
// 휴강으로 빠진 수업 (상세 화면에 줄 그어 보여 주기)
export function cancelledSegments(roomId, ds, data) {
  const wd = weekdayOf(ds);
  const off = data.exceptions.filter(e => e.room_id === roomId && e.date === ds && e.kind === '휴강');
  return data.schedules.filter(s => s.room_id === roomId && +s.weekday === wd && off.some(o => overlaps(o, s)));
}

// 그 시각의 상태
//  busy: 사용 중(seg) / soon: 지금은 비었지만 60분 안에 시작(next) / free: 비어 있음(until = 다음 사용 시각 또는 null)
export function roomStatus(roomId, ds, t, data) {
  const segs = busySegments(roomId, ds, data);
  const seg = segs.find(s => s.start_time <= t && t < s.end_time);
  if (seg) return { state: 'busy', seg };
  const next = segs.find(s => s.start_time > t);
  if (next && toMin(next.start_time) - toMin(t) <= 60) return { state: 'soon', next, left: toMin(next.start_time) - toMin(t) };
  return { state: 'free', next, left: next ? toMin(next.start_time) - toMin(t) : null };
}
