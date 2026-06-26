import { Router } from "express";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs";

const router = Router();

function addDir(zip: InstanceType<typeof AdmZip>, dirPath: string, zipPath: string) {
  const excludeDirs = new Set(["node_modules", ".git", "dist", ".tsbuildinfo"]);
  const excludeExts = new Set([".db", ".sqlite", ".map"]);
  const excludeFiles = new Set(["json.sqlite"]);

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (excludeDirs.has(entry.name)) continue;
    if (excludeFiles.has(entry.name)) continue;
    if (excludeExts.has(path.extname(entry.name))) continue;
    const full = path.join(dirPath, entry.name);
    const zp = path.join(zipPath, entry.name);
    if (entry.isDirectory()) {
      addDir(zip, full, zp);
    } else {
      zip.addLocalFile(full, path.dirname(zp));
    }
  }
}

router.get("/download/bot", (_req, res) => {
  const zip = new AdmZip();
  const root = "/home/runner/workspace";

  addDir(zip, path.join(root, "discord-bot"), "storm-bot-v10/discord-bot");
  addDir(zip, path.join(root, "artifacts/api-server"), "storm-bot-v10/api-server");

  const buf = zip.toBuffer();
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="storm-bot-v10.zip"');
  res.setHeader("Content-Length", buf.length);
  res.send(buf);
});

export default router;
