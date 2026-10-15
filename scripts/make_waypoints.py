"""포털캠 poses.json -> 로드뷰식 이동 지점(waypoints.json) 생성.
사용법: python3 scripts/make_waypoints.py
- 걸어간 경로에서 STEP(m)마다 한 지점씩 뽑고, 같은 층에서 가까운 지점끼리 연결한다.
"""
import json, math

STEP = 2.0          # 지점 간격 (m)
LINK_R = 3.2        # 이 거리 안의 같은 층 지점은 서로 이동 가능
SCENES = {
    # scene: (poses 파일, [(floor, idx 시작, idx 끝)])
    'building': ('public/scans/building/poses.json', [('1F', 0, 2042), ('4F', 2992, 4672)]),
    'classroom513': ('public/scans/classroom/poses.json', [('5F', 0, 1108)]),
}
# 층 라벨을 바로잡은 구간: (scene, 새 층) -> 옛 층. 옛 id 는 legacyId 로 남겨 저장된 신고가 계속 이어지게 한다.
LEGACY_FLOOR = {('building', '4F'): '5F'}

def quat_forward(w, x, y, z):  # 카메라 -Z 방향을 월드로
    v = (0, 0, -1)
    tx = 2 * (y * v[2] - z * v[1]); ty = 2 * (z * v[0] - x * v[2]); tz = 2 * (x * v[1] - y * v[0])
    return (v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx))

# 계단: 1층에서 위층까지 올라간 경로(poses 구간)를 층 사이 계단별로 나눈다. 기존 지점 id 는 바꾸지 않고 뒤에 덧붙인다.
STAIRS = {
    'building': {
        'range': (2043, 2991),
        'floors': {'1F': 0.5, '2F': 4.87, '3F': 8.86, '4F': 12.7},   # 각 층 바닥 높이(m): 계단 경로의 z 로 읽은 값
        'pairs': [('1F', '2F'), ('2F', '3F'), ('3F', '4F')],
        'first_floor_end': '1F', 'last_floor_start': '4F',          # 계단 시작/끝에 이어 줄 층
    },
}
STAIR_STEP = 1.0

out = {}
for scene, (path, ranges) in SCENES.items():
    poses = json.load(open(path))['poses']
    wps = []
    for floor, a, b in ranges:
        last = None
        for i in range(a, b + 1):
            p = poses[i]; t = p['T']
            if last is None or math.dist(t, last) >= STEP:
                f = quat_forward(*p['R'])
                heading = math.degrees(math.atan2(-f[0], f[1]))
                n = f'{len(wps):03d}'
                wp = {'id': f'{scene}-{floor}-{n}', 'scene': scene, 'floor': floor,
                      'pos': [round(t[0], 3), round(t[1], 3), round(t[2], 3)], 'heading': round(heading, 1)}
                if (scene, floor) in LEGACY_FLOOR:
                    wp['legacyId'] = f'{scene}-{LEGACY_FLOOR[(scene, floor)]}-{n}'
                wps.append(wp)
                last = t
    for w in wps:
        near = sorted((math.dist(w['pos'], o['pos']), o['id']) for o in wps
                      if o is not w and o['floor'] == w['floor'] and abs(o['pos'][2] - w['pos'][2]) < 1.0)
        w['links'] = [oid for d, oid in near if d <= LINK_R][:5]
    if scene in STAIRS:
        cfg = STAIRS[scene]; fz = cfg['floors']; chain = []
        a, b = cfg['range']; last = None
        for i in range(a, b + 1):
            p = poses[i]; t = p['T']
            if last is not None and math.dist(t, last) < STAIR_STEP: continue
            last = t
            pi = 0
            while pi < len(cfg['pairs']) - 1 and t[2] >= fz[cfg['pairs'][pi][1]] - 0.02: pi += 1   # 윗층 높이에 닿으면 다음 계단
            lo, hi = cfg['pairs'][pi]; mid = (fz[lo] + fz[hi]) / 2
            part = 'landing' if abs(t[2] - mid) < 0.5 else ('up' if t[2] < mid else 'down')
            f = quat_forward(*p['R'])
            name = lo[0] + hi[0]
            label = f'{lo[0]}–{hi[0]}층 계단 · ' + {'up': '올라가는 계단', 'landing': '층계참', 'down': '내려가는 계단'}[part]
            chain.append({'id': f"{scene}-ST{name}-{sum(1 for c in chain if c['stair'] == lo + '-' + hi):03d}", 'scene': scene, 'floor': f'ST{name}',
                          'stair': f'{lo}-{hi}', 'part': part, 'label': label,
                          'pos': [round(t[0], 3), round(t[1], 3), round(t[2], 3)],
                          'heading': round(math.degrees(math.atan2(-f[0], f[1])), 1), 'links': []})
        for k, w in enumerate(chain):  # 계단은 이어지는 한 줄 길: 앞/뒤 지점으로만 이동
            if k: w['links'].append(chain[k - 1]['id'])
            if k + 1 < len(chain): w['links'].append(chain[k + 1]['id'])
        first = [w for w in wps if w['floor'] == cfg['first_floor_end']][-1]    # 1층 끝 ↔ 계단 시작
        nxt = [w for w in wps if w['floor'] == cfg['last_floor_start']][0]      # 계단 끝 ↔ 위층 시작
        first['links'].append(chain[0]['id']); chain[0]['links'].append(first['id'])
        nxt['links'].append(chain[-1]['id']); chain[-1]['links'].append(nxt['id'])
        wps += chain
        print('stairs', len(chain), 'waypoints')
    out[scene] = wps
    print(scene, len(wps), 'waypoints')
json.dump(out, open('public/data/waypoints.json', 'w'), separators=(',', ':'))
