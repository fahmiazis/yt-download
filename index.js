const express = require('express');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
const port = process.env.PORT || 3002;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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

    // Download langsung ke root
    await youtubedl(url, {
      output: '%(playlist_index)02d - %(title)s.%(ext)s',
      format: 'best[height<=480]/best',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      noMtime: true
    });

    // Tambah delay lebih panjang buat server
    await delay(5000);

    // Cari file mp4 yang pattern playlist
    const files = fs.readdirSync(__dirname).filter(f => f.match(/^\d{2} - .*\.mp4$/));
    console.log("Files to zip:", files);

    if (files.length === 0) {
      return res.status(500).json({ error: 'Download failed or no files found' });
    }

    // Zip langsung
    await zipFiles(files, zipPath);

    // Hapus file video setelah zip
    for (const file of files) {
      fs.unlinkSync(path.join(__dirname, file));
    }

    // Download & cleanup zip
    res.download(zipPath, zipName, (err) => {
      if (!err) {
        fs.unlinkSync(zipPath);
      }
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: 'Failed to download or zip files' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});