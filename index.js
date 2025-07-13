const express = require('express');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
const port = 3002;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function zipFolder(source, out) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(out);

    archive.directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

app.get('/convert', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  try {
    console.log("Starting download for:", url);

    const today = new Date();
    const dateStr = `${today.getFullYear()}${(today.getMonth()+1+"").padStart(2,"0")}${(today.getDate()+"").padStart(2,"0")}`;
    const playlistTitle = `Playlist-${dateStr}`;
    const folderPath = path.join(__dirname, playlistTitle);

    await youtubedl(url, {
      output: '%(playlist_index)02d - %(title)s.%(ext)s',
      format: 'best[height<=480]/best',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      noMtime: true
    });

    await delay(2000);

    const filesInRoot = fs.readdirSync(__dirname).filter(f => f.match(/^\d{2} - .*\.mp4$/));
    console.log("Found files:", filesInRoot);

    if (filesInRoot.length === 0) {
      return res.status(500).json({ error: 'Download failed, no files found' });
    }

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }

    for (const file of filesInRoot) {
      fs.renameSync(path.join(__dirname, file), path.join(folderPath, file));
    }

    const zipName = `${playlistTitle}.zip`;
    const zipPath = path.join(__dirname, zipName);
    await zipFolder(folderPath, zipPath);
    console.log("Zipped to:", zipPath);

    // langsung download, kalau sukses hapus
    res.download(zipPath, zipName, (err) => {
      if (err) {
        console.error("Download error:", err);
      } else {
        console.log("Cleaning up files:", folderPath, zipPath);
        deleteFolderRecursive(folderPath);
        fs.unlinkSync(zipPath);
      }
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: 'Failed to download, move or zip files' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});