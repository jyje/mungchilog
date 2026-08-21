import type { TripData } from "./schema.js";

// M1 placeholder screens: view the itinerary without a map. React
// (apps/web) replaces this in M2.

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const baseStyle = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
         background: #111; color: #eee; margin: 0; padding: 2rem 1.25rem; max-width: 640px; }
  a { color: #7dd3fc; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; color: #ccc; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 0.6rem 0; border-bottom: 1px solid #262626; }
  .meta { color: #888; font-size: 0.85rem; }
  .empty { color: #777; padding: 2rem 0; }
  .spot-name { font-weight: 600; }
  .spot-local { color: #999; font-size: 0.85rem; margin-left: 0.4rem; }
`;

export function renderTripListPage(rows: { id: string; title: string; start_date: string; end_date: string }[]): string {
  const items = rows.length
    ? rows
        .map(
          (r) => `<li><a href="/trips/${r.id}">${escapeHtml(r.title)}</a>
            <div class="meta">${r.start_date} ~ ${r.end_date}</div></li>`,
        )
        .join("\n")
    : `<p class="empty">아직 일정이 없습니다. <code>POST /api/trips/import</code>로 JSON을 넣어주세요.</p>`;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>뭉치로그 — 여행 목록</title><style>${baseStyle}</style></head>
<body><h1>🐾 뭉치로그</h1><ul>${items}</ul></body></html>`;
}

export function renderTripDayPage(id: string, trip: TripData): string {
  const days = trip.days
    .map((day) => {
      const spots = day.spots.length
        ? day.spots
            .sort((a, b) => a.order - b.order)
            .map((s) => {
              const time = s.plannedArrival ? `<span class="meta">${escapeHtml(s.plannedArrival)}</span> ` : "";
              const local = s.nameLocal ? `<span class="spot-local">${escapeHtml(s.nameLocal)}</span>` : "";
              const items = s.items.length
                ? `<div class="meta">${s.items.map((i) => `${i.done ? "✅" : "⬜️"} ${escapeHtml(i.title)}`).join(" · ")}</div>`
                : "";
              return `<li>${time}<span class="spot-name">${escapeHtml(s.name)}</span>${local}${items}</li>`;
            })
            .join("\n")
        : `<li class="empty">스팟 없음</li>`;
      return `<h2>${escapeHtml(day.date)}</h2><ul>${spots}</ul>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(trip.title)} — 뭉치로그</title><style>${baseStyle}</style></head>
<body><p><a href="/trips">← 목록</a></p><h1>${escapeHtml(trip.title)}</h1>
<p class="meta">${trip.startDate} ~ ${trip.endDate} · ${escapeHtml(trip.timezone)}</p>
${days || '<p class="empty">일자 없음</p>'}</body></html>`;
}
