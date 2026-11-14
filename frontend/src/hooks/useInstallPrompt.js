import { useEffect, useState } from "react";

export function useInstallPrompt() {
  const [event, setEvent] = useState(null);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setEvent(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setEvent(null));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!event) return;
    event.prompt();
    await event.userChoice;
    setEvent(null);
  };

  return { canInstall: !!event, install };
}
