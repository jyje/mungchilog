# Google Maps JS API 커스텀 범위 참고 문서

이 앱이 실제로 쓰는 Google Maps JavaScript API(`@vis.gl/react-google-maps` 래퍼)에서 뭘 어디까지 직접 그릴 수 있는지 정리한 것. 다음에 지도 위에 뭔가 새로 그려야 할 때 매번 조사하지 않도록, 그리고 사용자와 이 프로젝트를 다루는 어시스턴트가 같은 기준을 보도록 여기 둔다.

핵심만 먼저: 마커·오버레이·도형 레벨은 사실상 제한이 없다 — 개발자가 그릴 수 있는 모든 DOM/WebGL 콘텐츠를 그대로 지도에 얹을 수 있다. 진짜 제약이 걸리는 지점은 딱 하나, **지도 타일 자체의 스타일링 방식(JSON vs Cloud)**뿐이다.

## 레벨별 커스텀 범위

| 레벨 | 기술 | 커스텀 가능 범위 | 제약 |
|---|---|---|---|
| 마커 | `AdvancedMarkerElement` | `content`에 임의의 `HTMLElement`/`Node`를 통째로 주입 — React가 렌더링한 DOM도 그대로 마커로 쓸 수 있다 | `mapId`가 있는 지도에서만 동작([공식 문서](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview)). 테스트용으로 `mapId: "DEMO_MAP_ID"`를 쓸 수 있지만 프로덕션 금지 — 레거시 `google.maps.Marker`는 2024-02 지원 종료([마이그레이션 가이드](https://developers.google.com/maps/documentation/javascript/advanced-markers/migration)) |
| 마커(단순) | `PinElement` | 배경색·테두리색·글리프(텍스트/아이콘)만 변경, 핀 모양 자체는 유지 | 핀 형태를 벗어나려면 `content`로 전환 |
| 팝업 | `InfoWindow` | 내부 HTML은 커스텀 가능하나 말풍선 프레임·닫기버튼은 Google이 강제 | 완전한 자유도가 필요하면 `OverlayView` 기반 커스텀 툴팁 |
| 일반 오버레이 | `OverlayView` (raster) | 위경도→픽셀 변환(`fromLatLngToDivPixel`)만 제공받고, 그 위는 순수 DOM을 자유 배치 | 2D DOM 한정, 확대/축소 시 재계산은 직접 구현 |
| GPU 레벨 | `WebGLOverlayView` | 지도가 쓰는 것과 **동일한 WebGL 컨텍스트**를 공유 — Three.js, deck.gl로 3D 객체를 지도와 완전히 동기화(깊이 오클루전 포함) | **벡터 지도(`mapId` 있는 지도)에서만 동작**([공식 문서](https://developers.google.com/maps/documentation/javascript/webgl/webgl-overlay-view)) |
| 도형 | `Polyline`/`Polygon`/`Circle` | 색상·굵기·점선 패턴·아이콘 시퀀스(화살표 등) 자유 설정 | `IconSequence`의 `google.maps.SymbolPath` 상수는 브라우저 전역이라, jsdom에서 도는 순수 로직 모듈(`routeStyles.ts`)에 직접 넣으면 테스트가 깨진다 — 실제 상수 참조는 `RouteOverlay.tsx`처럼 브라우저에서만 마운트되는 컴포넌트 안에서 (이 프로젝트가 이미 그렇게 하고 있다: 아래 참고) |
| 경로 | `DirectionsRenderer` | 기본 폴리라인/마커 스타일 옵션 변경 | 완전 커스텀 UI가 필요하면 `DirectionsService`로 경로 데이터만 받아 직접 렌더링 (이 프로젝트는 애초에 `DirectionsRenderer`를 안 쓰고, 서버가 Routes API/NAVITIME 응답을 파싱해 좌표만 클라이언트에 넘긴다) |
| 지도 자체 스타일 | JSON Styling (raster) *또는* Cloud-based Styling (vector) | 색상, 도로/POI 표시 여부 등 | **`mapId`가 있으면 코드의 `styles` 옵션은 무시된다** — 벡터 지도는 반드시 Cloud Console에서만 스타일 관리([공식 문서](https://developers.google.com/maps/documentation/javascript/cbms-release-notes)). 두 방식 혼용 불가 |
| 컨트롤 | Custom Controls | 줌/전체화면 등 기본 컨트롤 대체, 임의의 DOM을 지도 특정 위치에 고정 | — |

## 이 프로젝트에서 실제로 쓰고 있는 것 / 앞으로 쓸 수 있는 것

- **`mapId`는 이미 설정돼 있다** (`apps/web/src/components/TripMap.tsx`의 `mapId="mungchilog-trip-map"`, 벡터 지도) — 즉 `AdvancedMarkerElement`와 `WebGLOverlayView` 둘 다 이미 조건이 갖춰져 있다. 지도 색감을 바꾸고 싶으면 코드의 `styles` 프로퍼티가 아니라 [Google Cloud Console의 Map Style](https://console.cloud.google.com/google/maps-apis/studio/styles)에서 이 `mapId`에 연결된 스타일을 편집해야 한다 — 코드에 `styles`를 넣어도 조용히 무시된다.
- **경유지/스팟 마커**: 이미 `AdvancedMarker` + `Pin`(번호 핀)과 `AdvancedMarker` + 커스텀 `content`(현재 위치, 공유 위치, 장소 탐색 마커) 둘 다 쓰고 있다 — `apps/web/src/components/TripMap.tsx`, `CurrentLocation.tsx`. 사진·태그·메모가 들어간 리치 마커가 필요해지면 같은 패턴(`content`에 React가 렌더링한 DOM)으로 바로 확장 가능.
- **경로선 색상/아이콘**: `apps/web/src/routeStyles.ts`(순수 로직, `google.*` 미참조) + `apps/web/src/components/RouteOverlay.tsx`(실제 `Polyline` 렌더링, `google.maps.SymbolPath.CIRCLE`·`FORWARD_CLOSED_ARROW` 참조)가 정확히 위 표의 "도형" 행 패턴을 따른다. 도보/탑승 구간마다 색을 나누고, 진행 방향 화살표를 `IconSequence`로 얹는 것도 전부 `Polyline` 옵션만으로 구현했다(`DirectionsRenderer` 불필요).
- **구간 아이콘 뱃지**(도보 발자국, 전철/버스 아이콘)는 `AdvancedMarker` + `content`로 구현했다(`RouteOverlay.tsx`의 `RouteModeMarker`) — 지도 마커가 임의 DOM을 허용한다는 걸 활용한 사례.
- **정차 지점 상세정보**는 지금 `InfoWindow`가 아니라 별도 사이드 패널(`PlaceDetailsPanel.tsx`)로 구현돼 있어서, 위 표의 "InfoWindow 프레임 제약" 문제 자체를 원천적으로 피해가고 있다. 지도 위에 바로 뜨는 팝업이 필요해지면 `InfoWindow`보다 `OverlayView` 기반 커스텀을 우선 검토.

## 원칙: 정식 개발자 도구부터

이 프로젝트는 Google이 공식으로 제공하는 컴포넌트/API(`AdvancedMarker`, `Polyline`, `IconSequence`, `OverlayView`, Cloud-based Styling 등)로 구현 가능한 범위 안에서는 그것부터 쓰고, deck.gl/Three.js 같은 서드파티 렌더링 레이어는 공식 도구로 안 되는 것(대량의 3D 오브젝트, 커스텀 셰이더 등)이 실제로 필요해졌을 때만 고려한다.

## 참고 링크

- [Advanced Markers 개요](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview)
- [Advanced Markers 마이그레이션 가이드](https://developers.google.com/maps/documentation/javascript/advanced-markers/migration) (레거시 `Marker` deprecated 안내)
- [WebGL Overlay View](https://developers.google.com/maps/documentation/javascript/webgl/webgl-overlay-view)
- [Cloud-based Maps Styling 릴리스 노트](https://developers.google.com/maps/documentation/javascript/cbms-release-notes) (`mapId`와 JSON `styles` 동시 사용 불가 안내)
- [Style Reference](https://developers.google.com/maps/documentation/javascript/style-reference) (raster 지도에서 JSON `styles`를 쓸 경우)
