import { requireOptionalNativeModule } from "expo";
type VoiceCallbacks = {
  onText: (text: string) => void;
  onEnd: () => void;
  onError: (reason: "voiceUnavailable" | "voiceDenied" | "noSpeech") => void;
};
export async function startVoice(
  language: string,
  callbacks: VoiceCallbacks,
): Promise<() => void> {
  const speech = requireOptionalNativeModule<any>("ExpoSpeechRecognition");
  if (!speech || !speech.isRecognitionAvailable())
    throw new Error("voiceUnavailable");
  const permission = await speech.requestPermissionsAsync();
  if (!permission.granted) throw new Error("voiceDenied");
  const subscriptions: any[] = [];
  let heard = false;
  let failed = false;
  subscriptions.push(
    speech.addListener("result", (event: any) => {
      const text = event.results?.[0]?.transcript;
      if (text) {
        heard = true;
        callbacks.onText(text);
      }
    }),
  );
  subscriptions.push(
    speech.addListener("error", (event: any) => {
      failed = true;
      callbacks.onError(
        event.error === "not-allowed"
          ? "voiceDenied"
          : event.error === "language-not-supported"
            ? "voiceUnavailable"
            : "noSpeech",
      );
    }),
  );
  subscriptions.push(
    speech.addListener("end", () => {
      subscriptions.forEach((s) => s.remove());
      if (!heard && !failed) callbacks.onError("noSpeech");
      callbacks.onEnd();
    }),
  );
  try {
    speech.start({
      lang: language,
      interimResults: true,
      continuous: false,
      punctuation: true,
    });
  } catch (error) {
    subscriptions.forEach((s) => s.remove());
    throw error;
  }
  return () => speech.stop();
}
