import { api } from './api.js';
let wp;
export const getWaypoints = () => (wp ||= api.waypoints());
// 신고 작성 중인 내용 (화면 사이에서 공유)
export const draft = { pin: null, shot: null, photo: null, detail: '', kind: '하자', label: '', category: '', lostFound: '분실' };
export function resetDraft() { Object.assign(draft, { pin: null, shot: null, photo: null, detail: '', kind: '하자', label: '', category: '', lostFound: '분실' }); }
// 화면 사이에 넘기는 3D 투어 요청 (새로고침해도 유지되도록 sessionStorage 에도 저장)
export const nav = {
  get tour() { try { return JSON.parse(sessionStorage.getItem('khu_tour')); } catch { return null; } },
  set tour(v) { try { v ? sessionStorage.setItem('khu_tour', JSON.stringify(v)) : sessionStorage.removeItem('khu_tour'); } catch {} },
};
export function goTour(opts) { nav.tour = opts; location.hash = '#/tour'; }
