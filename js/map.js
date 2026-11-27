// Leaflet 지연 로드 (지도 열 때만)
let L = null;
async function leaflet() {
  if (L) return L;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.append(css);
  L = await import('https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js');
  return L;
}
const maps = new Map();

// pts: [{lat,lng,label}] / numbered: 순서 번호 마커 + 선
export async function showMap(elId, pts, numbered) {
  let el = document.getElementById(elId);
  if (!el) return;
  if (!pts.length) { el.innerHTML = '<p class="empty">좌표가 있는 장소가 없습니다</p>'; return; }
  try { await leaflet(); } catch { el.innerHTML = '<p class="empty">지도를 불러오지 못했습니다</p>'; return; }
  el = document.getElementById(elId); // 로드 중 재렌더되었을 수 있음
  if (!el) return;
  const sig = JSON.stringify(pts), old = maps.get(elId);
  const note = () => { const n = document.getElementById(elId); if (n && !n.nextElementSibling?.classList.contains('map-note')) n.insertAdjacentHTML('afterend', '<small class="map-note muted">위치는 대략적일 수 있음 (중국 좌표계 차이로 수백 m 어긋날 수 있음)</small>'); };
  // 동기화로 화면이 다시 그려져도 같은 지점이면 기존 지도(확대·이동 상태)를 그대로 옮겨 붙인다
  if (old && old.sig === sig && old.el !== el) { el.replaceWith(old.el); old.m.invalidateSize(); note(); return; }
  if (old?.el === el) return;
  old?.m.remove();
  const m = L.map(el);
  maps.set(elId, { m, el, sig });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
  const ll = pts.map(p => [p.lat, p.lng]);
  pts.forEach((p, i) => {
    const opt = numbered ? { icon: L.divIcon({ className: '', html: `<div class="mk">${i + 1}</div>`, iconSize: [26, 26] }) } : {};
    const s = document.createElement('span');
    s.textContent = p.label;
    L.marker([p.lat, p.lng], opt).addTo(m).bindPopup(s);
  });
  if (numbered && ll.length > 1) L.polyline(ll, { color: '#1d5fd1' }).addTo(m);
  note();
  if (ll.length === 1) m.setView(ll[0], 15); else m.fitBounds(ll, { padding: [24, 24] });
}
