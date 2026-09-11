import { useState } from "react";
import { Switch } from "@/components/ui/switch";

function SharingExample({ initialChecked }: { initialChecked: boolean }) {
  const [checked, setChecked] = useState(initialChecked);
  const id = initialChecked ? "gallery-sharing-on" : "gallery-sharing-off";
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Initially {initialChecked ? "ON" : "OFF"}</p>
      <label htmlFor={id} className="flex min-h-16 cursor-pointer items-center justify-between gap-6 rounded-lg border p-4">
        <span className="min-w-0">
          <span className="block text-sm font-medium">내 위치 공유</span>
          <span className="block text-xs text-muted-foreground">{checked ? "ON · 이 여행에 위치 공유 중" : "OFF · 위치를 공유하지 않음"}</span>
        </span>
        <Switch id={id} checked={checked} onCheckedChange={setChecked} aria-label={`내 위치 공유 ${initialChecked ? "ON" : "OFF"} 예시`} />
      </label>
    </div>
  );
}

export function LocationSharingExamples() {
  return (
    <section className="space-y-3" aria-label="Location sharing ON and OFF">
      <h3 className="font-semibold">Location sharing</h3>
      <p className="text-sm text-muted-foreground">Two independent, interactive states. This demo does not request or transmit your location.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <SharingExample initialChecked={false} />
        <SharingExample initialChecked />
      </div>
    </section>
  );
}
