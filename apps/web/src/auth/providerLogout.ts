const PROVIDER_LOGOUT_TIMEOUT_MS = 15_000;

export async function restartAfterProviderLogout(logoutUrl: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const logoutFrame = document.createElement("iframe");
    let settled = false;

    function cleanUp() {
      window.clearTimeout(timeout);
      logoutFrame.remove();
    }

    function finish(callback: () => void) {
      if (settled) return;
      settled = true;
      cleanUp();
      callback();
    }

    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error("provider logout timed out")));
    }, PROVIDER_LOGOUT_TIMEOUT_MS);

    logoutFrame.hidden = true;
    logoutFrame.tabIndex = -1;
    logoutFrame.title = "로그인 세션 종료 중";
    logoutFrame.addEventListener("load", () => {
      finish(resolve);
    }, { once: true });
    logoutFrame.addEventListener("error", () => {
      finish(() => reject(new Error("provider logout failed")));
    }, { once: true });
    logoutFrame.src = logoutUrl;
    document.body.append(logoutFrame);
  });

  window.location.assign("/auth/logout-complete");
}
