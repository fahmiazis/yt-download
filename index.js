const express = require('express');
const cors = require('cors')
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

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

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, ["-y", ...args]);
    let stderr = '';

    ff.stderr.on('data', data => stderr += data.toString());
    ff.on('close', code => {
      if (code === 0) resolve();
      else reject(`ffmpeg exited with code ${code}: ${stderr}`);
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
  if (!url || !title) return res.status(400).json({ error: 'Missing url or title' });

  try {
    console.log("Downloading:", title);

    const formatSelector = "bestvideo[height<=1080][height>=720]+bestaudio/best[height<=720][height>=480]/best";

    await runYtdlp(url, [
      "--output", `${title}.%(ext)s`,
      "-f", formatSelector,
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "--no-mtime"
    ]);

    await delay(1000);

    // cek file apa yg barusan dibuat
    const allFiles = fs.readdirSync(__dirname);
    const downloadedFile = allFiles.find(f => f.startsWith(title));
    console.log("Files:", allFiles, "Picked:", downloadedFile);

    if (!downloadedFile) {
      return res.status(500).json({
        error: 'Download failed or no files found',
        debug: { allFiles }
      });
    }

    const filePath = path.join(__dirname, downloadedFile);

    res.download(filePath, downloadedFile, (err) => {
      if (!err) {
        fs.unlinkSync(filePath);
      }
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: 'Failed to download video', err });
  }
});

app.get('/download-video', async (req, res) => {
  const { url, title } = req.query;
  if (!url || !title) return res.status(400).json({ error: 'Missing url or title' });

  try {
    console.log("Downloading:", title);

    const formatSelector = "bestvideo[height<=1080][height>=720][ext=mp4]/bestvideo[height<=1080][height>=720]/bestvideo";

    await runYtdlp(url, [
      "--output", `${title}.%(ext)s`,
      "-f", formatSelector,
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "--no-mtime"
    ]);

    await delay(1000);

    // cek file apa yg barusan dibuat
    const allFiles = fs.readdirSync(__dirname);
    const downloadedFile = allFiles.find(f => f.startsWith(title));
    console.log("Files:", allFiles, "Picked:", downloadedFile);

    if (!downloadedFile) {
      return res.status(500).json({
        error: 'Download failed or no files found',
        debug: { allFiles }
      });
    }

    const filePath = path.join(__dirname, downloadedFile);

    res.download(filePath, downloadedFile, (err) => {
      if (!err) {
        fs.unlinkSync(filePath);
      }
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: 'Failed to download video', err });
  }
});

app.get('/download-mux', async (req, res) => {
  const { url, title } = req.query;
  if (!url || !title) return res.status(400).json({ error: 'Missing url or title' });

  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_");
  const videoFile = `${safeTitle}_video.mp4`;
  const audioFile = `${safeTitle}_audio.m4a`;
  const finalFile = `${safeTitle}_final.mp4`;

  try {
    console.log(`Downloading VIDEO ONLY for: ${title}`);

    await runYtdlp(url, [
      "--output", videoFile,
      "-f", "(bestvideo[height<=1080][height>=720])[ext=mp4]/(bestvideo[height<=1080][height>=720])",
      "--user-agent", "Mozilla/5.0",
      "--no-mtime"
    ]);

    console.log(`Downloading AUDIO ONLY for: ${title}`);

    await runYtdlp(url, [
      "--output", audioFile,
      "-f", "bestaudio[ext=m4a]/bestaudio",
      "--user-agent", "Mozilla/5.0",
      "--no-mtime"
    ]);

    console.log(`Muxing with ffmpeg...`);

    await runFfmpeg([
      "-i", videoFile,
      "-i", audioFile,
      "-c:v", "copy",
      "-c:a", "aac",
      "-strict", "experimental",
      finalFile
    ]);

    console.log(`Sending muxed file: ${finalFile}`);
    res.download(path.join(__dirname, finalFile), finalFile, (err) => {
      if (!err) {
        fs.unlinkSync(videoFile);
        fs.unlinkSync(audioFile);
        fs.unlinkSync(finalFile);
      }
    });

  } catch (err) {
    console.error("Muxing failed:", err);
    res.status(500).json({ error: "Muxing failed", err });
  }
});

app.get('/download-audio', async (req, res) => {
  const { url, title } = req.query;
  if (!url || !title) return res.status(400).json({ error: 'Missing url or title' });

  const filename = `${title}.m4a`;
  try {
    await runYtdlp(url, [
      "--output", filename,
      "-f", "bestaudio[ext=m4a]/bestaudio",
      "--no-mtime",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    ]);

    await delay(2000);

    if (!fs.existsSync(path.join(__dirname, filename))) {
      return res.status(500).json({ error: 'Audio file not found' });
    }

    res.download(path.join(__dirname, filename), filename, (err) => {
      if (!err) fs.unlinkSync(path.join(__dirname, filename));
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: 'Failed to download audio', err });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});