import type { TwelvelabsApi } from "twelvelabs-js";

export const emptyPageData: TwelvelabsApi.SearchItem[] = [];

export const singleClipResult: TwelvelabsApi.SearchItem[] = [
  {
    start: 12.5,
    end: 18.75,
    videoId: "67cec9caf45d9b64a58340fc",
    rank: 0,
    thumbnailUrl: "https://example.com/thumb_1.jpg",
    transcription: "A red sports car drives down a coastal highway.",
  },
];

export const manyClipResults: TwelvelabsApi.SearchItem[] = Array.from(
  { length: 25 },
  (_, i) => ({
    start: i * 10,
    end: i * 10 + 5,
    videoId: `vid_${i.toString().padStart(3, "0")}`,
    rank: i,
    thumbnailUrl: `https://example.com/thumb_${i}.jpg`,
    transcription: `Transcription for clip number ${i}.`,
  }),
);

export const groupedByVideoResult: TwelvelabsApi.SearchItem[] = [
  {
    id: "video_abc",
    videoId: "video_abc",
    clips: [
      {
        start: 0,
        end: 4,
        videoId: "video_abc",
        thumbnailUrl: "https://example.com/clip_a1.jpg",
      },
      {
        start: 30,
        end: 34,
        videoId: "video_abc",
        thumbnailUrl: "https://example.com/clip_a2.jpg",
      },
    ],
  },
];
