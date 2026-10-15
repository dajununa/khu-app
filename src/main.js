import './style.css';
import { hub } from './screens/hub.js';
import { home } from './screens/home.js';
import { plan } from './screens/plan.js';
import { board } from './screens/board.js';
import { report } from './screens/report.js';
import { rooms, roomDetail } from './screens/rooms.js';
import { amenities, amenityFloor } from './screens/amenities.js';
import { admin } from './screens/admin.js';
import { openTour } from './screens/tour.js';
import { nav, draft, resetDraft } from './lib/state.js';

const screen = document.getElementById('screen'), tourHost = document.getElementById('tour'), tabbar = document.getElementById('tabbar');
let cleanup = null, closeTour = null, token = 0;

function setTab(tab) {
  tabbar.hidden = !tab;
  screen.classList.toggle('full', !tab);
  tabbar.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
}

async function route() {
  const my = ++token;
  const [, name, arg, arg2] = location.hash.split('/');
  cleanup?.(); cleanup = null; closeTour?.(); closeTour = null;
  tourHost.hidden = true;
  document.querySelectorAll('.sheet-bg').forEach(el => el.remove()); // 화면이 바뀌면 열려 있던 시트는 닫는다

  if (name === 'tour') {
    if (!nav.tour) { location.hash = '#/fix'; return; }
    setTab(null); screen.hidden = true;
    const opts = nav.tour;
    const c = await openTour(tourHost, opts, {
      onClose: () => (history.length > 1 ? history.back() : (location.hash = '#/fix')),
      onPin: ({ pin, shot, label }) => {
        resetDraft(); Object.assign(draft, { pin, shot, label });
        nav.tour = { ...opts, waypointId: pin.waypoint, yaw: pin.yaw, pitch: pin.pitch }; // 뒤로 오면 핀한 자리에서 다시 시작
        location.hash = '#/report';
      },
    });
    if (my !== token) c(); else closeTour = c;
    return;
  }
  screen.hidden = false; screen.scrollTop = 0;
  let el;
  if (name === 'board') { setTab('board'); el = board(); }
  else if (name === 'report') { setTab(null); el = report(); }
  else if (name === 'floor') { setTab('home'); el = await plan(arg); }
  else if (name === 'fix') { setTab('home'); el = home(); }
  else if (name === 'rooms') { setTab('home'); el = rooms(); }
  else if (name === 'room') { setTab('home'); el = roomDetail(arg); }
  else if (name === 'amen') { setTab('home'); el = amenities(); }
  else if (name === 'amen-floor') { setTab('home'); el = amenityFloor(arg); }
  else if (name === 'admin') { setTab(null); el = admin(arg, arg2); }
  else { setTab('home'); el = hub(); }
  if (my !== token) return;
  cleanup = el._cleanup || null;
  screen.replaceChildren(el);
}
addEventListener('hashchange', route);
route();
