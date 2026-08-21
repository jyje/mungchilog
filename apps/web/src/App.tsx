import { useEffect, useState } from "react";
import { TripListPage } from "./pages/TripListPage";
import { TripDayPage } from "./pages/TripDayPage";
import { ImportPage } from "./pages/ImportPage";
import { NewTripPage } from "./pages/NewTripPage";

// Hand-rolled router: this app only ever has a handful of route shapes,
// so a real router dependency isn't worth the bytes (see PLAN.md's
// decision to skip the original TanStack Router plan).
export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(next: string) {
    window.history.pushState({}, "", next);
    setPath(next);
  }

  const dayMatch = path.match(/^\/trips\/([^/]+)$/);

  if (path === "/import") return <ImportPage navigate={navigate} />;
  if (path === "/new") return <NewTripPage navigate={navigate} />;
  if (dayMatch) return <TripDayPage id={dayMatch[1]} navigate={navigate} />;
  return <TripListPage navigate={navigate} />;
}
