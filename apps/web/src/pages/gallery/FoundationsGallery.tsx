const TOKENS = [
  ["Canvas", "--bg", "--text"], ["Surface", "--surface", "--text"],
  ["Primary", "--primary", "--primary-foreground"], ["Secondary", "--secondary", "--secondary-foreground"],
  ["Muted", "--muted", "--muted-foreground"], ["Destructive", "--destructive", "--destructive-foreground"],
  ["Accommodation", "--stay-soft", "--stay"], ["Stay border", "--stay-line", "--text"],
  ["Input / border", "--input", "--text"], ["Focus ring", "--ring", "--accent-contrast"],
] as const;

export function FoundationsGallery() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Semantic theme tokens">
        {TOKENS.map(([label, background, color]) => (
          <div key={label} className="min-w-0">
            <div className="flex h-20 items-center rounded-lg border px-3 text-sm font-medium" style={{ background: `var(${background})`, color: `var(${color})` }}>{label}</div>
            <code className="mt-2 block break-all text-xs text-muted-foreground">{background}</code>
          </div>
        ))}
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        <section className="space-y-3">
          <h3 className="font-semibold">Typography</h3>
          <p className="text-3xl font-semibold tracking-tight">여행의 다음 장면</p>
          <p>예약과 이동 시간을 한눈에 확인하세요.</p>
          <p className="text-sm text-muted-foreground">System font stack with Korean fallbacks. Body 16px, small 15px, labels 14px.</p>
          <p className="tabular-nums">09:30 · 24 min · 2.4 km</p>
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">Spacing and surfaces</h3>
          <div className="flex items-end gap-4">{[4, 8, 12, 16, 24, 32].map(size => <div key={size} className="space-y-2 text-center"><div className="w-4 rounded-sm bg-primary" style={{ height: size }} /><span className="text-xs">{size}</span></div>)}</div>
          <div className="flex flex-wrap gap-3">
            <span className="rounded-sm border px-3 py-2 text-sm">Small</span>
            <span className="rounded-lg border px-3 py-2 text-sm">Large</span>
            <span className="rounded-xl border px-3 py-2 text-sm shadow-sm">Overlay elevation</span>
          </div>
          <p className="text-sm text-muted-foreground">Radius derives from --radius (10px). Page gutters: 16px mobile, 32px tablet, 40px desktop.</p>
        </section>
      </div>
      <div className="border-l-2 border-primary pl-4 text-sm text-muted-foreground">
        <p>Use visible focus and a checkmark or text for selection. Planner targets are at least 44px. Motion honors reduced-motion preferences.</p>
        <p>Accommodation purple is a category color. Map route colors describe transport and keep their own contrast treatment.</p>
      </div>
    </div>
  );
}
