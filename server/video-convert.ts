import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";

/**
 * Convert MOV (iPhone/celular) to MP4 (H.264) so Chrome and other browsers can play it.
 * Requires ffmpeg to be installed. If not available or conversion fails, returns null.
 */
export async function convertMovToMp4(inputBuffer: Buffer): Promise<Buffer | null> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `mov-${Date.now()}-${Math.random().toString(36).slice(2)}.mov`);
  const outputPath = path.join(tmpDir, `mp4-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

  try {
    await fs.writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      const ff = spawn(
        "ffmpeg",
        [
          "-y",
          "-i", inputPath,
          "-c:v", "libx264",
          "-c:a", "aac",
          "-movflags", "+faststart",
          "-preset", "fast",
          outputPath,
        ],
        { stdio: "pipe" }
      );
      let stderr = "";
      ff.stderr?.on("data", (d) => { stderr += d.toString(); });
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
      });
      ff.on("error", (err) => reject(err));
    });

    const outBuffer = await fs.readFile(outputPath);
    return outBuffer;
  } catch (err) {
    console.warn("[video-convert] ffmpeg not available or conversion failed:", (err as Error).message);
    return null;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

export function isMovFile(filename: string, mimetype?: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".mov") return true;
  if (mimetype === "video/quicktime") return true;
  return false;
}
