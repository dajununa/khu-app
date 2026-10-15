import './style.css';
import { home, choose } from './screens/home.js';
import { plan } from './screens/plan.js';
import { board } from './screens/board.js';
import { report } from './screens/report.js';
import { stairs } from './screens/stairs.js';
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
  const [, name, arg] = location.hash.split('/');
  cleanup?.(); cleanup = null; closeTour?.(); closeTour = null;
  tourHost.hidden = true;

  if (name === 'tour') {
    if (!nav.tour) { location.hash = '#/'; return; }
    setTab(null); screen.hidden = true;
    const opts = nav.tour;
    const c = await openTour(tourHost, opts, {
      onClose: () => (history.length > 1 ? history.back() : (location.hash = '#/')),
      onPin: ({ pin, shot, label }) => {
        const kind = draft.kind; resetDraft(); Object.assign(draft, { kind, pin, shot, label });
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
  else if (name === 'stairs') { setTab('home'); el = await stairs(arg); }
  else if (name === 'floor') { setTab('home'); el = await plan(arg); }
  else if (name === 'building') { setTab('home'); el = home(); }
  else { setTab('home'); el = choose(); }
  if (my !== token) return;
  cleanup = el._cleanup || null;
  screen.replaceChildren(el);
}
addEventListener('hashchange', route);
route();
