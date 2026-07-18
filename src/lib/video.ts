import { config } from "./config";

export type VideoRoom = {
  roomUrl: string;
  provider: string;
  quality: string;
  screenShareEnabled: boolean;
  recordingEnabled: boolean;
};

export async function createVideoRoom(
  sessionId: string,
  opts?: { recording?: boolean; quality?: string }
): Promise<VideoRoom> {
  const quality = opts?.quality || "hd";
  const recording = Boolean(opts?.recording);

  if (config.video.dailyApiKey && (config.video.provider === "daily" || !config.video.provider)) {
    try {
      const res = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.video.dailyApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `medcare-${sessionId}`,
          properties: {
            enable_chat: true,
            enable_screenshare: true,
            enable_recording: recording ? "cloud" : undefined,
            exp: Math.floor(Date.now() / 1000) + 86400,
            max_participants: 8,
          },
        }),
      });
      if (res.ok) {
        const room = (await res.json()) as { url?: string };
        if (room.url) {
          return {
            roomUrl: room.url,
            provider: "daily",
            quality,
            screenShareEnabled: true,
            recordingEnabled: recording,
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  // High-quality Jitsi config via URL hash (open-source HD fallback)
  const jitsiFlags = [
    "config.disableDeepLinking=true",
    "config.startWithAudioMuted=false",
    "config.startWithVideoMuted=false",
    "config.disableSimulcast=false",
    "config.resolution=720",
    "interfaceConfig.DISABLE_JOIN_LEAVE_NOTIFICATIONS=true",
  ].join("&");

  return {
    roomUrl: `https://meet.jit.si/medcare-${sessionId}#${jitsiFlags}`,
    provider: config.video.dailyApiKey ? "jitsi-fallback" : "jitsi",
    quality,
    screenShareEnabled: true,
    recordingEnabled: recording,
  };
}

export async function transcribeSessionNotes(
  notes: string,
  symptomsHint?: string
): Promise<string> {
  if (config.ai.enabled && notes.trim()) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.ai.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.ai.openaiModel,
          messages: [
            {
              role: "system",
              content:
                "You are a medical scribe. Produce a concise clinical transcription / SOAP-style summary from visit notes. Do not invent facts.",
            },
            {
              role: "user",
              content: `Visit notes:\n${notes}\n${symptomsHint ? `Context: ${symptomsHint}` : ""}`,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch {
      /* local fallback */
    }
  }

  const lines = notes
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return [
    "AI transcription (local rules):",
    `Timestamp: ${new Date().toISOString()}`,
    symptomsHint ? `Context: ${symptomsHint}` : null,
    "Summary:",
    ...lines.map((l, i) => `${i + 1}. ${l}`),
    "Assessment: Pending clinician confirmation.",
    "Plan: Follow documented medical notes.",
  ]
    .filter(Boolean)
    .join("\n");
}
