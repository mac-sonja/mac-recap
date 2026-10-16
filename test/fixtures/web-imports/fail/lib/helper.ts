import sharp from "sharp";
import { spawn } from "node:child_process";

export const thumbnail = [sharp, spawn];

export async function later() {
  const { chromium } = await import("playwright");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return [chromium, Anthropic];
}
