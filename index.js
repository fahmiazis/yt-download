import express from "express";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

app.use(express.json());

// GET /get-playlist-items?playlistUrl=...
app.get("/get-playlist-items", (req, res) => {
  const { playlistUrl } = req.query;
  if (!playlistUrl) return res.status(400).json({ error: "Missing playlistUrl" });

  console.log("Fetching playlist:", playlistUrl);

  execFile("yt-dlp", [
    "--flat-playlist",
    "--dump-single-json",
    playlistUrl
  ], (error, stdout, stderr) => {
    if (error) {
      console.error("Error getting playlist:", stderr);
      return res.status(500).json({ error: "Failed to get playlist" });
    }

    try {
      const json = JSON.parse(stdout);
      const playlist = json.title || "Unknown Playlist";
      const items = (json.entries || []).map(item => ({
        title: item.title,
        url: `https://www.youtube.com/watch?v=${item.id}`
      }));

      return res.json({ playlist, items });
    } catch (err) {
      console.error("JSON parse error:", err);
      return res.status(500).json({ error: "Failed to parse playlist data" });
    }
  });
});

// GET /convert?url=...
app.get("/convert", (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  console.log("Downloading single video:", url);

  const today = new Date();
  const stamp = `${today.getFullYear()}${(today.getMonth()+1+"").padStart(2,"0")}${(today.getDate()+"").padStart(2,"0")}_${today.getTime()}`;
  const filename = `video-${stamp}.mp4`;
  const filepath = path.join(__dirname, filename);

  execFile("yt-dlp", [
    "-f", "bestvideo+bestaudio/best",
    "-o", filepath,
    "--merge-output-format", "mp4",
    url
  ], (error, stdout, stderr) => {
    console.log(stdout);
    if (error) {
      console.error("Download error:", stderr);
      return res.status(500).json({ error: "Failed to download video" });
    }

    console.log("Download done:", filepath);
    res.download(filepath, () => {
      console.log("Cleaning up:", filepath);
      fs.unlinkSync(filepath);
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});