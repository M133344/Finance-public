// Metro chooses voice.native.ts on iOS; this implementation serves the web build.
export type VoiceCallbacks = {
  onText: (text: string) => void;
  onEnd: () => void;
  onError: (reason: "voiceUnavailable" | "voiceDenied" | "noSpeech") => void;
};
export async function startVoice(
  language: string,
  callbacks: VoiceCallbacks,
): Promise<() => void> {
  const browser = globalThis as any;
  const Recognition =
    browser.SpeechRecognition || browser.webkitSpeechRecognition;
  if (!Recognition) throw new Error("voiceUnavailable");
  const recognition = new Recognition();
  recognition.lang = language;
  recognition.interimResults = true;
  recognition.continuous = false;
  let heard = false;
  let failed = false;
  recognition.onresult = (event: any) => {
    const text = Array.from(event.results)
      .map((r: any) => r[0].transcript)
      .join(" ");
    heard = !!text;
    callbacks.onText(text);
  };
  recognition.onerror = (event: any) => {
    failed = true;
    callbacks.onError(
      event.error === "not-allowed"
        ? "voiceDenied"
        : event.error === "language-not-supported"
          ? "voiceUnavailable"
          : "noSpeech",
    );
  };
  recognition.onend = () => {
    if (!heard && !failed) callbacks.onError("noSpeech");
    callbacks.onEnd();
  };
  recognition.start();
  return () => recognition.stop();
}
