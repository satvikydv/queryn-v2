/**
 * Real-time transcription via Amazon Transcribe Streaming.
 * Accepts a Node.js PassThrough stream of raw PCM audio (16kHz, 16-bit, mono)
 * and yields transcript deltas as they arrive.
 *
 * P46: Real-time transcription via Amazon Transcribe
 * P47: Live transcription displayed with minimal delay
 */

import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  LanguageCode,
  type AudioStream,
} from "@aws-sdk/client-transcribe-streaming";
import { PassThrough } from "stream";
import { env } from "@/env";

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: TranscribeStreamingClient | null = null;

function getClient(): TranscribeStreamingClient {
  if (!_client) {
    _client = new TranscribeStreamingClient({
      region: env.AWS_TRANSCRIBE_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
    console.log(`[Transcribe] Client initialised — region: ${env.AWS_TRANSCRIBE_REGION}`);
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptDelta {
  text: string;
  isFinal: boolean;
  startTime?: number;
  endTime?: number;
}

// ---------------------------------------------------------------------------
// Core streaming transcription
// ---------------------------------------------------------------------------

/**
 * Start a real-time transcription session.
 *
 * @param audioStream - Node.js PassThrough piped with PCM chunks
 * @param onDelta     - callback receiving each transcript update
 * @param languageCode - defaults to "en-US"
 * @returns stop() function to cleanly end the session
 */
export async function startTranscription(
  audioStream: PassThrough,
  onDelta: (delta: TranscriptDelta) => void,
  languageCode: LanguageCode = LanguageCode.EN_US,
): Promise<{ stop: () => void }> {
  const client = getClient();

  // Convert PassThrough into the async iterable AudioStream format expected by Transcribe
  async function* audioEventStream(): AsyncIterable<AudioStream> {
    for await (const chunk of audioStream) {
      yield { AudioEvent: { AudioChunk: chunk as Uint8Array } };
    }
  }

  const command = new StartStreamTranscriptionCommand({
    LanguageCode: languageCode,
    MediaSampleRateHertz: 16000,
    MediaEncoding: "pcm",
    AudioStream: audioEventStream(),
    EnablePartialResultsStabilization: true,
    PartialResultsStability: "medium",
  });

  // Launch transcription — do not await here so caller can stop() it
  const responsePromise = client.send(command);

  let stopped = false;

  // Process transcript results in background
  void (async () => {
    try {
      console.log("[Transcribe] Awaiting stream connection...");
      const response = await responsePromise;
      console.log("[Transcribe] Stream connected. HasResultStream:", !!response.TranscriptResultStream);
      if (!response.TranscriptResultStream) return;

      for await (const event of response.TranscriptResultStream) {
        if (stopped) break;

        const results = event.TranscriptEvent?.Transcript?.Results;
        if (!results?.length) continue;

        for (const result of results) {
          const alt = result.Alternatives?.[0];
          if (!alt?.Transcript) continue;

          onDelta({
            text: alt.Transcript,
            isFinal: !result.IsPartial,
            startTime: result.StartTime,
            endTime: result.EndTime,
          });
        }
      }
    } catch (err) {
      // Always log — don't suppress even if stopped, so region/auth errors surface
      console.error("[Transcribe] Stream error:", err);
    }
  })();

  return {
    stop: () => {
      stopped = true;
      audioStream.end();
    },
  };
}
