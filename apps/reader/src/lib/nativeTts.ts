import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeTtsPlugin = {
  speak(options: { text: string; locale: string; rate: number }): Promise<{ engine?: string; locale?: string }>;
};

export type PronunciationResult = {
  provider: "android-native" | "web-speech";
  voice?: string;
};

const NativeTextToSpeech = registerPlugin<NativeTtsPlugin>("NativeTextToSpeech");

function waitForBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  const current = window.speechSynthesis.getVoices();
  if (current.length > 0) {
    return Promise.resolve(current);
  }
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(window.speechSynthesis.getVoices()), 600);
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      window.clearTimeout(timeout);
      resolve(window.speechSynthesis.getVoices());
    }, { once: true });
  });
}

async function speakInBrowser(text: string): Promise<PronunciationResult> {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    throw new Error("当前浏览器没有可用的英语发音引擎");
  }
  const voices = await waitForBrowserVoices();
  const voice = voices.find((item) => item.lang.toLowerCase() === "en-us" && item.localService)
    ?? voices.find((item) => item.lang.toLowerCase() === "en-us")
    ?? voices.find((item) => item.lang.toLowerCase().startsWith("en") && item.localService)
    ?? voices.find((item) => item.lang.toLowerCase().startsWith("en"));

  return new Promise((resolve, reject) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.lang || "en-US";
    utterance.voice = voice ?? null;
    utterance.rate = 0.84;
    utterance.pitch = 1;
    const timeout = window.setTimeout(() => reject(new Error("发音引擎响应超时")), 8000);
    utterance.onend = () => {
      window.clearTimeout(timeout);
      resolve({ provider: "web-speech", voice: voice?.name });
    };
    utterance.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("英语发音播放失败"));
    };
    window.speechSynthesis.speak(utterance);
  });
}

export async function speakEnglish(text: string): Promise<PronunciationResult> {
  const clean = text.trim();
  if (!clean) {
    throw new Error("没有可播放的单词");
  }
  if (Capacitor.getPlatform() === "android") {
    const result = await NativeTextToSpeech.speak({ text: clean, locale: "en-US", rate: 0.84 });
    return { provider: "android-native", voice: result.engine };
  }
  return speakInBrowser(clean);
}
