import { config } from "./config";

export type VideoRoom = {
  roomUrl: string;
  provider: string;
};

export async function createVideoRoom(sessionId: string): Promise<VideoRoom> {
  if (config.video.dailyApiKey && config.video.provider === "daily") {
    try {
      const res = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.video.dailyApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: `medcare-${sessionId}`,
          properties: { enable_chat: true, exp: Math.floor(Date.now() / 1000) + 86400 },
        }),
      });
      if (res.ok) {
        const room = (await res.json()) as { url?: string };
        if (room.url) {
          return { roomUrl: room.url, provider: "daily" };
        }
      }
    } catch {
      /* fall through to mock */
    }
  }

  return {
    roomUrl: `https://meet.jit.si/medcare-${sessionId}`,
    provider: "mock",
  };
}
