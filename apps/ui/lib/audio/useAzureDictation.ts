"use client";
import { useEffect, useRef, useState } from "react";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
type Status = "idle" | "requesting" | "recording" | "transcribing";
type Issue = "permission" | "noSpeech" | "unavailable" | "failed";
type Capture = {
  controller: AbortController;
  stream?: MediaStream;
  meter?: AudioContext;
  analyser?: AnalyserNode;
  recorder?: MediaRecorder;
  timer?: ReturnType<typeof setTimeout>;
};
const MAX_SECONDS = 55;

async function pcmWave(recording: Blob) {
  const source = new OfflineAudioContext(1, 1, 16000);
  const decoded = await source.decodeAudioData(await recording.arrayBuffer());
  const context = new OfflineAudioContext(
    1,
    Math.max(1, Math.min(decoded.length, MAX_SECONDS * 16000)),
    16000,
  );
  const sampler = context.createBufferSource();
  sampler.buffer = decoded;
  sampler.connect(context.destination);
  sampler.start();
  const mono = (await context.startRendering()).getChannelData(0),
    size = mono.length * 2;
  const view = new DataView(new ArrayBuffer(44 + size));
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + size, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, size, true);
  for (let i = 0; i < mono.length; i++) {
    const value = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}
function release(capture: Capture) {
  clearTimeout(capture.timer);
  if (capture.meter && capture.meter.state !== "closed")
    void capture.meter.close().catch(() => {});
  if (capture.recorder?.state === "recording") capture.recorder.stop();
  capture.stream?.getTracks().forEach((track) => track.stop());
}
/** The caller owns the editable input. A finished utterance is never sent as a chat message. */
export function useAzureDictation(onText: (text: string) => void) {
  const [status, setStatus] = useState<Status>("idle"),
    [issue, setIssue] = useState<Issue | null>(null),
    [supported, setSupported] = useState(false);
  const active = useRef<Capture | null>(null),
    write = useRef(onText);
  useEffect(() => {
    write.current = onText;
  }, [onText]);
  useEffect(() => {
    setSupported(
      Boolean(
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
          typeof MediaRecorder !== "undefined" &&
          typeof OfflineAudioContext !== "undefined",
      ),
    );
    return () => {
      if (active.current) {
        active.current.controller.abort();
        release(active.current);
        active.current = null;
      }
    };
  }, []);
  function cancel() {
    if (!active.current) return;
    active.current.controller.abort();
    release(active.current);
    active.current = null;
    setIssue(null);
    setStatus("idle");
  }
  async function toggle() {
    if (active.current) {
      if (active.current.recorder?.state === "recording")
        active.current.recorder.stop();
      return;
    }
    if (!supported) return;
    const capture: Capture = { controller: new AbortController() };
    active.current = capture;
    setStatus("requesting");
    setIssue(null);
    function finish(problem?: Issue) {
      release(capture);
      if (active.current === capture) {
        active.current = null;
        setStatus("idle");
        if (problem) setIssue(problem);
      }
    }
    try {
      capture.meter = new AudioContext();
      void capture.meter.resume().catch(() => {});
      capture.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (capture.controller.signal.aborted) {
        release(capture);
        return;
      }
      const analyser = capture.meter.createAnalyser();
      analyser.fftSize = 2048;
      capture.meter.createMediaStreamSource(capture.stream).connect(analyser);
      capture.analyser = analyser;
      const recorder = new MediaRecorder(capture.stream);
      capture.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        capture.controller.abort();
        finish("failed");
      };
      recorder.onstop = async () => {
        release(capture);
        if (capture.controller.signal.aborted) return;
        setStatus("transcribing");
        try {
          const body = await pcmWave(
            new Blob(chunks, { type: recorder.mimeType }),
          );
          const headers = new Headers(await authenticatedJsonHeaders());
          headers.set("Content-Type", "audio/wav");
          const response = await fetch("/api/audio/dictation", {
            method: "POST",
            headers,
            body,
            cache: "no-store",
            signal: capture.controller.signal,
          });
          const data = await response.json();
          if (active.current !== capture) return;
          if (!response.ok || typeof data.text !== "string")
            return finish(
              data.error === "no_speech"
                ? "noSpeech"
                : data.error === "dictation_unavailable"
                  ? "unavailable"
                  : "failed",
            );
          write.current(data.text);
          finish();
        } catch {
          finish("failed");
        }
      };
      recorder.start();
      setStatus("recording");
      capture.timer = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_SECONDS * 1000);
    } catch (error) {
      finish(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "permission"
          : "failed",
      );
    }
  }
  return {
    status,
    issue,
    supported,
    toggle,
    cancel,
    analyser: status === "recording" ? active.current?.analyser : undefined,
  };
}
