const express = require('express');
const cors = require('cors')
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { spawn } = require('child_process');

const app = express();
app.use(cors())
const port = process.env.PORT || 3002;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function runYtdlp(url, args=[]) {
  return new Promise((resolve, reject) => {
    const proc = spawn('./yt-dlp', [url, ...args]);
    let stderr = '', stdout = '';

    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);

    proc.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject({ code, stdout, stderr });
    });
  });
}

function zipFiles(files, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 }});

    output.on('close', () => resolve());
    archive.on('error', err => reject(err));

    archive.pipe(output);

    for (const file of files) {
      archive.file(path.join(__dirname, file), { name: file });
    }

    archive.finalize();
  });
}

app.get('/convert', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  try {
    console.log("Starting download for:", url);

    const today = new Date();
    const dateStr = `${today.getFullYear()}${(today.getMonth()+1+"").padStart(2,"0")}${(today.getDate()+"").padStart(2,"0")}`;
    const zipName = `Playlist-${dateStr}.zip`;
    const zipPath = path.join(__dirname, zipName);

    await runYtdlp(url, [
      "--output", "%(playlist_index)02d - %(title)s.%(ext)s",
      "--format", "best[height>=1080]/best",
      "--merge-output-format", "mp4",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "--no-mtime"
    ]);

    await delay(3000);

    const allFiles = fs.readdirSync(__dirname);
    const files = allFiles.filter(f => f.match(/^\d{2} - .*\.mp4$/));

    console.log("All files:", allFiles);
    console.log("Filtered:", files);

    if (files.length === 0) {
      return res.status(500).json({ 
        error: 'Download failed or no files found',
        debug: { allFiles }
      });
    }

    await zipFiles(files, zipPath);

    for (const file of files) {
      fs.unlinkSync(path.join(__dirname, file));
    }

    res.download(zipPath, zipName, (err) => {
      if (!err) {
        fs.unlinkSync(zipPath);
      }
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ 
      error: 'Failed to download or zip files', 
      err 
    });
  }
});

app.get('/get-playlist-items', async (req, res) => {
  const { playlistUrl } = req.query;
  if (!playlistUrl) return res.status(400).json({ error: 'Missing playlistUrl' });

  try {
    const { stdout } = await runYtdlp(playlistUrl, ["--flat-playlist", "--dump-single-json"]);
    const json = JSON.parse(stdout);
    const playlist = json.title || "Unknown Playlist";
    const items = (json.entries || []).map(item => ({
      title: item.title,
      url: `https://www.youtube.com/watch?v=${item.id}`
    }));

    res.json({ playlist, items });
  } catch (err) {
    console.error("Playlist error:", err);
    res.status(500).json({ error: "Failed to get playlist", err });
  }
});

app.get('/download-single', async (req, res) => {
  const { url, title } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  try {
    // console.log("Get title for single video:", url);

    // Ambil judul video
    // const { stdout: titleStdout } = await runYtdlp(url, ["--get-title"]);
    // let lines = titleStdout.split('\n').map(l => l.trim()).filter(l => l);
    let safeTitle = title
    // let safeTitle = lines[0] || `video-${Date.now()}`;
    safeTitle = safeTitle
      .replace(/[\/\\?%*:|"<>]/g, '-')   // hilangin karakter ilegal
      .substring(0, 500);                 // batasi panjang nama file

    const filename = `${safeTitle}.mp4`;
    const filepath = path.join(__dirname, filename);

    console.log(`Downloadings "${safeTitle}" as file: ${filename}`);

    const formatSelector = 
      "(bestvideo[height<=1080][height>=720])[ext=mp4]+bestaudio[ext=m4a]" +
      "/(bestvideo[height<=720][height>=480])[ext=mp4]+bestaudio[ext=m4a]" +
      "/(bestvideo[height<=480])[ext=mp4]+bestaudio[ext=m4a]" +
      "/best";

    // Download video
    await runYtdlp(url, [
      "--output", filepath,
      // "--format", "best[height=1080]/best",
      "-f", formatSelector,
      "--merge-output-format", "mp4",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "--no-mtime"
    ]);

    console.log("Download done:", filepath);

    // Kirim file ke client lalu hapus
    res.download(filepath, filename, (err) => {
      if (!err) {
        try {
          fs.unlinkSync(filepath);
          console.log("File deleted:", filepath);
        } catch (e) {
          console.error("Error deleting file:", e);
        }
      } else {
        console.error("Error sending file:", err);
      }
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      error: 'Failed to download single video',
      err
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});