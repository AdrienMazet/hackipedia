"use client";

import { useEffect, useRef } from "react";

type ElevenLabsWaveformProps = {
  className?: string;
  height?: number | string;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
  speed?: number;
  barColor?: string;
  fadeEdges?: boolean;
  fadeWidth?: number;
  data?: number[];
};

// Adapted from the official ElevenLabs waveform registry component so it works
// in this Vite + CSS setup without the Tailwind/shadcn install prerequisites.
export function ElevenLabsWaveform({
  className,
  height = 16,
  barWidth = 1.4,
  barGap = 1,
  barRadius = 999,
  speed = 44,
  barColor,
  fadeEdges = true,
  fadeWidth = 18,
  data,
}: ElevenLabsWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<Array<{ x: number; height: number }>>([]);
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const seedRef = useRef(Math.random());
  const dataIndexRef = useRef(0);
  const heightStyle = typeof height === "number" ? `${height}px` : height;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const context = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      if (context) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.scale(dpr, dpr);
      }

      const step = barWidth + barGap;
      let currentX = rect.width;
      let index = 0;
      const nextBars: Array<{ x: number; height: number }> = [];

      while (currentX > -step) {
        const seededValue =
          Math.sin(seedRef.current * 10000 + index * 137.5) * 10000;

        nextBars.push({
          x: currentX,
          height: 0.2 + (seededValue - Math.floor(seededValue)) * 0.6,
        });
        currentX -= step;
        index += 1;
      }

      barsRef.current = nextBars;
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [barGap, barWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return undefined;
    }

    const animate = (currentTime: number) => {
      const deltaTime = lastTimeRef.current
        ? (currentTime - lastTimeRef.current) / 1000
        : 0;

      lastTimeRef.current = currentTime;

      const rect = canvas.getBoundingClientRect();
      context.clearRect(0, 0, rect.width, rect.height);

      const computedBarColor =
        barColor ||
        getComputedStyle(canvas)
          .getPropertyValue("--hackipedia-waveform-color")
          .trim() ||
        "#2db45c";

      const step = barWidth + barGap;

      for (const bar of barsRef.current) {
        bar.x -= speed * deltaTime;
      }

      barsRef.current = barsRef.current.filter((bar) => bar.x + barWidth > -step);

      while (
        barsRef.current.length === 0 ||
        barsRef.current[barsRef.current.length - 1].x < rect.width
      ) {
        const lastBar = barsRef.current[barsRef.current.length - 1];
        const nextX = lastBar ? lastBar.x + step : rect.width;

        let nextHeight: number;

        if (data && data.length > 0) {
          nextHeight = data[dataIndexRef.current % data.length] || 0.1;
          dataIndexRef.current = (dataIndexRef.current + 1) % data.length;
        } else {
          const timeSeed = Date.now() / 1000;
          const uniqueIndex = barsRef.current.length + timeSeed * 0.01;
          const seededValue =
            Math.sin(seedRef.current * 10000 + uniqueIndex * 137.5) * 10000;
          const randomValue = seededValue - Math.floor(seededValue);
          const waveA = Math.sin(uniqueIndex * 0.1) * 0.2;
          const waveB = Math.cos(uniqueIndex * 0.05) * 0.15;

          nextHeight = Math.max(
            0.12,
            Math.min(0.92, 0.32 + waveA + waveB + randomValue * 0.36),
          );
        }

        barsRef.current.push({ x: nextX, height: nextHeight });

        if (barsRef.current.length > 240) {
          break;
        }
      }

      const centerY = rect.height / 2;

      for (const bar of barsRef.current) {
        if (bar.x >= rect.width || bar.x + barWidth <= 0) {
          continue;
        }

        const actualBarHeight = Math.max(3, bar.height * rect.height * 0.64);
        const y = centerY - actualBarHeight / 2;

        context.fillStyle = computedBarColor;
        context.globalAlpha = 0.32 + bar.height * 0.68;
        context.beginPath();
        context.roundRect(bar.x, y, barWidth, actualBarHeight, barRadius);
        context.fill();
      }

      if (fadeEdges && fadeWidth > 0 && rect.width > 0) {
        const gradient = context.createLinearGradient(0, 0, rect.width, 0);
        const fadePercent = Math.min(0.18, fadeWidth / rect.width);

        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(fadePercent, "rgba(255,255,255,0)");
        gradient.addColorStop(1 - fadePercent, "rgba(255,255,255,0)");
        gradient.addColorStop(1, "rgba(255,255,255,1)");

        context.globalCompositeOperation = "destination-out";
        context.fillStyle = gradient;
        context.fillRect(0, 0, rect.width, rect.height);
        context.globalCompositeOperation = "source-over";
      }

      context.globalAlpha = 1;
      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    barColor,
    barGap,
    barRadius,
    barWidth,
    data,
    fadeEdges,
    fadeWidth,
    speed,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: heightStyle }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="hackipedia-elevenlabs-waveform-canvas" />
    </div>
  );
}
