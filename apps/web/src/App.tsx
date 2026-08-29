import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "./api";
import { TripListPage } from "./pages/TripListPage";
import { TripDayPage } from "./pages/TripDayPage";
import { ImportPage } from "./pages/ImportPage";
import { NewTripPage } from "./pages/NewTripPage";
import { LoginPage } from "./pages/LoginPage";
import { PendingPage } from "./pages/PendingPage";
import { AdminPage } from "./pages/AdminPage";
import { ThemeToggle } from "./components/ThemeToggle";
import { AppNav } from "./components/AppNav";
import { GalleryPage } from "./pages/GalleryPage";
import { canAccessCurrentGallery } from "./galleryAccess";

// Hand-rolled router: this app only ever has a handful of route shapes,
// so a real router dependency isn't worth the bytes (see PLAN.md's
// decision to skip the original TanStack Router plan).
export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const isGalleryRoute = path === "/gallery" && canAccessCurrentGallery();

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(next: string) {
    window.history.pushState({}, "", next);
    setPath(next);
  }

  // /auth/* is real server-side navigation (OIDC redirect round-trip),
  // never an SPA route - never intercept it here.
  const { data: me, isLoading, isFetchedAfterMount } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: !isGalleryRoute,
    // The query cache is persisted for offline itineraries. Authentication
    // itself must always be confirmed by this browser session before any of
    // that cache is allowed to render, especially after a user switch.
    staleTime: 0,
    refetchOnMount: "always",
  });

  // M6: gate every SPA route behind login + admin approval. Redirects run
  // as an effect (not during render) since they're a side effect of data
  // that just loaded, not something to compute inline.
  useEffect(() => {
    if (isGalleryRoute || isLoading || !isFetchedAfterMount) return;
    if (!me && path !== "/login") {
      navigate("/login");
    } else if (me) {
      if (me.status === "pending" && path !== "/pending") navigate("/pending");
      else if (me.status === "approved" && (path === "/login" || path === "/pending")) navigate("/trips");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, isGalleryRoute, isLoading, isFetchedAfterMount, path]);

  if (isGalleryRoute) return <GalleryPage />;
  if (path === "/login") return <LoginPage />;
  if (isLoading || !isFetchedAfterMount) return <p className="meta page">불러오는 중...</p>;
  if (!me) return null; // redirecting to /login
  if (path === "/pending" || me.status === "pending") return <PendingPage me={me} />;

  const dayMatch = path.match(/^\/trips\/([^/]+)$/);

  // TripDayPage owns its own full-viewport layout (SplitMapShell) with a
  // floating header - it deliberately doesn't get the standard AppNav, to
  // keep the map as the dominant element there.
  if (dayMatch) return <TripDayPage id={dayMatch[1]} navigate={navigate} me={me} />;

  let page;
  if (path === "/import") page = <ImportPage navigate={navigate} />;
  else if (path === "/new") page = <NewTripPage navigate={navigate} />;
  else if (path === "/admin") page = me.role === "admin" ? <AdminPage /> : <TripListPage navigate={navigate} />;
  else page = <TripListPage navigate={navigate} />;

  return (
    <>
      <AppNav me={me} navigate={navigate} />
      {page}
      <ThemeToggle />
    </>
  );
}
