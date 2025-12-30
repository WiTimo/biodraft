import express from "express";
import { nanoid } from "nanoid";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import https from "https";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Simple CORS for local dev (Vite runs on a different port).
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

/**
 * Configure these for your environment.
 * - BLENDER_BIN: absolute path recommended in production (e.g. /usr/bin/blender)
 * - BLENDER_SCRIPT: your bpy render script
 */
const BLENDER_BIN = "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe"
const BLENDER_SCRIPT = process.env.BLENDER_SCRIPT ?? path.resolve("scripts/render_bbox_front_back.py");

// Optional: if your .glb always contains a consistent mesh name, set it.
// If not set, the Blender file must have the mesh as the active object,
// or you extend the script to auto-pick the largest mesh.
const BLENDER_OBJECT_NAME = process.env.BLENDER_OBJECT_NAME ?? "";

// Job root (local disk)
const JOB_ROOT = path.resolve("jobs");
if (!fs.existsSync(JOB_ROOT)) fs.mkdirSync(JOB_ROOT, { recursive: true });

/**
 * In-memory job state
 */
const jobs = new Map(); // jobId -> { status, progress, message, dir, error }
const sseClients = new Map(); // jobId -> Set(res)

/**
 * Utility: broadcast job updates to SSE listeners
 */
function emitProgress(jobId, progress, message) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.progress = progress;
  job.message = message;

  const payload = `data: ${JSON.stringify({ jobId, progress, message, status: job.status })}\n\n`;
  const set = sseClients.get(jobId);
  if (set) {
    for (const res of set) res.write(payload);
  }
}

/**
 * Utility: safe delete
 */
async function safeRm(p) {
  try {
    await fsp.rm(p, { recursive: true, force: true });
  } catch {}
}

/**
 * Stream-download BioMesh GLB to file (no external deps).
 * POST https://biomesh.flussing.com/api/generate with JSON body.
 * BioMesh docs: streams model/gltf-binary. :contentReference[oaicite:1]{index=1}
 */
function downloadBiomeshGLBToFile({ body, outFile, onStage }) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);

    const req = https.request(
      "https://biomesh.flussing.com/api/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(json)
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (text += c));
          res.on("end", () => reject(new Error(`BioMesh error ${res.statusCode}: ${text.slice(0, 2000)}`)));
          return;
        }

        const total = Number(res.headers["content-length"] ?? 0) || 0;
        let received = 0;

        const file = fs.createWriteStream(outFile);
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total > 0) {
            // Map download to 20% -> 60%
            const pct = 20 + Math.floor((received / total) * 40);
            onStage(Math.min(60, Math.max(20, pct)), `Downloading .glb (${Math.floor(received / 1024)} KB)`);
          }
        });

        res.pipe(file);

        file.on("finish", () => file.close(() => resolve()));
        file.on("error", (err) => reject(err));
        res.on("error", (err) => reject(err));
      }
    );

    req.on("error", (err) => reject(err));
    req.write(json);
    req.end();
  });
}

/**
 * Spawn Blender to render images using your Python script.
 */
function runBlenderRender({ blendFile, outputDir }) {
  return new Promise((resolve, reject) => {
    const args = [
      "-b",
      blendFile,
      "-P",
      BLENDER_SCRIPT,
      "--",
      "--output_dir",
      outputDir,
      "--front_name",
      "front.png",
      "--back_name",
      "back.png"
    ];

    if (BLENDER_OBJECT_NAME) {
      args.push("--object", BLENDER_OBJECT_NAME);
    }

    const p = spawn(BLENDER_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Blender exited with code ${code}\n\nSTDERR:\n${stderr}\n\nSTDOUT:\n${stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * IMPORTANT:
 * BioMesh returns a .glb, but Blender cannot directly execute bpy scripts on a raw .glb.
 * We therefore create a small temporary .blend by importing the glb via Blender itself.
 *
 * Easiest: use Blender once to import glb and save as .blend.
 */
function convertGlbToBlend({ glbPath, blendPath }) {
  return new Promise((resolve, reject) => {
    // This uses Blender background mode to import glTF/GLB and save a .blend.
    const py = `
import bpy
import sys
argv = sys.argv
argv = argv[argv.index("--")+1:] if "--" in argv else []
glb = argv[0]
out = argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
# Ensure something is active: pick the largest mesh by vertex count.
meshes = [o for o in bpy.data.objects if o.type=="MESH"]
if not meshes:
    raise RuntimeError("No mesh found after glb import")
meshes.sort(key=lambda o: len(o.data.vertices), reverse=True)
bpy.context.view_layer.objects.active = meshes[0]
meshes[0].select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=out)
print("OK")
`;

    const args = [
      "-b",
      "--python-expr",
      py,
      "--",
      glbPath,
      blendPath
    ];

    const p = spawn(BLENDER_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`GLB->BLEND import failed. code=${code}\n${stderr}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * POST /api/jobs
 * Body: { gender, height, weight, muscle?, units }
 * Returns: { jobId }
 */
app.post("/api/jobs", async (req, res) => {
  const { gender, height, weight, muscle = 0, units = "metric" } = req.body ?? {};

  if (!gender || !["female", "male"].includes(gender)) {
    return res.status(400).json({ error: "gender must be 'female' or 'male'" });
  }
  if (typeof height !== "number" || typeof weight !== "number") {
    return res.status(400).json({ error: "height and weight must be numbers" });
  }
  if (!["metric", "imperial"].includes(units)) {
    return res.status(400).json({ error: "units must be 'metric' or 'imperial'" });
  }
  if (typeof muscle !== "number" || muscle < 0 || muscle > 100) {
    return res.status(400).json({ error: "muscle must be a number between 0 and 100" });
  }

  const jobId = nanoid();
  const dir = path.join(JOB_ROOT, jobId);
  await fsp.mkdir(dir, { recursive: true });

  const job = {
    status: "queued",
    progress: 0,
    message: "Queued",
    dir,
    error: null
  };
  jobs.set(jobId, job);

  res.json({ jobId });

  // Run job asynchronously
  (async () => {
    try {
      job.status = "running";
      emitProgress(jobId, 5, "Validating input");

      // 1) Call BioMesh and stream glb to disk
      emitProgress(jobId, 15, "Requesting BioMesh .glb");
      const glbPath = path.join(dir, "model.glb");

      await downloadBiomeshGLBToFile({
        body: { gender, height, weight, muscle, units },
        outFile: glbPath,
        onStage: (pct, msg) => emitProgress(jobId, pct, msg)
      });

      emitProgress(jobId, 65, "Converting .glb to .blend");
      const blendPath = path.join(dir, "scene.blend");
      await convertGlbToBlend({ glbPath, blendPath });

      // 2) Render with Blender script (writes front.png/back.png into dir)
      emitProgress(jobId, 80, "Rendering front/back images in Blender");
      await runBlenderRender({ blendFile: blendPath, outputDir: dir });

      // 3) Delete heavy intermediates (glb + blend). Keep images until download.
      await safeRm(glbPath);
      await safeRm(blendPath);

      job.status = "done";
      emitProgress(jobId, 100, "Done");
    } catch (e) {
      job.status = "error";
      job.error = String(e?.stack || e?.message || e);
      emitProgress(jobId, job.progress, "Error");
    }
  })();
});

/**
 * GET /api/jobs/:jobId/events  (SSE progress)
 */
app.get("/api/jobs/:jobId/events", (req, res) => {
  const { jobId } = req.params;
  if (!jobs.has(jobId)) return res.status(404).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Register client
  const set = sseClients.get(jobId) ?? new Set();
  set.add(res);
  sseClients.set(jobId, set);

  // Send current state immediately
  const job = jobs.get(jobId);
  res.write(`data: ${JSON.stringify({ jobId, progress: job.progress, message: job.message, status: job.status })}\n\n`);

  req.on("close", () => {
    const s = sseClients.get(jobId);
    if (s) {
      s.delete(res);
      if (s.size === 0) sseClients.delete(jobId);
    }
  });
});

/**
 * GET /api/jobs/:jobId/status
 */
app.get("/api/jobs/:jobId/status", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: "not found" });

  res.json({
    jobId,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error
  });
});

/**
 * GET /api/jobs/:jobId/images
 * Returns ONLY front/back images (no zip).
 * Response: { jobId, frontDataUrl, backDataUrl }
 * After successful send, deletes the entire job directory.
 */
app.get("/api/jobs/:jobId/images", async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: "not found" });

  if (job.status === "error") {
    return res.status(500).json({ error: "job failed", detail: job.error });
  }
  if (job.status !== "done") {
    return res.status(409).json({ error: "not ready", status: job.status, progress: job.progress });
  }

  const frontPath = path.join(job.dir, "front.png");
  const backPath = path.join(job.dir, "back.png");
  if (!fs.existsSync(frontPath) || !fs.existsSync(backPath)) {
    return res.status(500).json({ error: "images missing" });
  }

  try {
    const [frontBuf, backBuf] = await Promise.all([
      fsp.readFile(frontPath),
      fsp.readFile(backPath),
    ]);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    // Delete everything after the response finishes
    res.on("finish", async () => {
      const dir = job.dir;
      jobs.delete(jobId);
      sseClients.delete(jobId);
      await safeRm(dir);
    });

    res.json({
      jobId,
      frontDataUrl: `data:image/png;base64,${frontBuf.toString("base64")}`,
      backDataUrl: `data:image/png;base64,${backBuf.toString("base64")}`,
    });
  } catch (e) {
    return res.status(500).json({ error: "failed to read images", detail: String(e?.message || e) });
  }
});

const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`BLENDER_BIN=${BLENDER_BIN}`);
  console.log(`BLENDER_SCRIPT=${BLENDER_SCRIPT}`);
});
