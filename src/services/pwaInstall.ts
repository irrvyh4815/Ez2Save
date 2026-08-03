export interface PwaInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installPrompt: PwaInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as PwaInstallPromptEvent;
    window.dispatchEvent(new Event("ez2save-install-ready"));
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    window.dispatchEvent(new Event("ez2save-install-ready"));
  });
}

export function isPwaInstallAvailable() {
  return Boolean(installPrompt);
}

export async function installPwa() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === "accepted") installPrompt = null;
  return choice.outcome === "accepted";
}
