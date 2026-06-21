import { StrictMode } from "react";
import { Capacitor } from "@capacitor/core";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

const isNativeApp = Capacitor.isNativePlatform();

function clearRuntimeCaches() {
  if (!("caches" in window)) {
    return Promise.resolve();
  }
  return caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).then(() => undefined);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (isNativeApp) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .then(() => clearRuntimeCaches())
        .then(() => {
          window.setTimeout(() => {
            clearRuntimeCaches().catch((error: unknown) => {
              console.warn("delayed cache cleanup failed", error);
            });
          }, 1500);
        })
        .catch((error: unknown) => {
          console.warn("service worker cleanup failed", error);
        });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("service worker registration failed", error);
    });
  });
}
