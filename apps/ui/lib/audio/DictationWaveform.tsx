"use client";
import React, { useEffect, useRef } from "react";
/** A short rolling history of microphone RMS levels. Silence stays at the baseline. */
export function DictationWaveform({
  analyser,
  className,
}: {
  analyser: AnalyserNode;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current,
      ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const buffer = new Float32Array(analyser.fftSize);
    const amplitudes: number[] = [];
    function draw() {
      if (!el || !ctx) return;
      const { width, height } = el.getBoundingClientRect(),
        scale = Math.min(window.devicePixelRatio, 2);
      if (width === 0 || height === 0) return;
      const pixels = Math.round(width * scale),
        rows = Math.round(height * scale);
      if (el.width !== pixels || el.height !== rows) {
        el.width = pixels;
        el.height = rows;
      }
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const sample of buffer) sum += sample * sample;
      const amplitude = Math.min(1, Math.sqrt(sum / buffer.length) * 4);
      amplitudes.push(amplitude);
      const count = Math.max(1, Math.floor(width / 4));
      if (amplitudes.length > count)
        amplitudes.splice(0, amplitudes.length - count);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = getComputedStyle(el).color;
      for (let i = 0; i < count; i++) {
        const level = amplitudes[i - (count - amplitudes.length)] ?? 0;
        const h = Math.max(2, level * (height - 2));
        ctx.fillRect(i * 4, (height - h) / 2, 2, h);
      }
    }
    draw();
    const timer = window.setInterval(
      draw,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 55,
    );
    return () => window.clearInterval(timer);
  }, [analyser]);
  return <canvas aria-hidden="true" className={className} ref={canvas} />;
}
