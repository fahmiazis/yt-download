const express = require('express');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
const port = 3002;

app.get('/convert', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  try {
    const outputTemplate = '%(playlist_title)s/%(playlist_index)02d - %(title)s.%(ext)s';
    console.log(`Starting download: ${url}`);

    const dlResult = await youtubedl(url, {
      output: '%(playlist_title)s/%(playlist_index)02d - %(title)s.%(ext)s',
      format: 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      noMtime: true,
      noCheckCertificates: true
    });
    console.log("Download JSON:", dlResult);

    const playlistTitle = dlResult.playlist_title || dlResult.title || 'UnknownPlaylist';
    const folderPath = path.join(__dirname, playlistTitle);
    console.log("Expecting folder:", folderPath);

    await new Promise(resolve => setTimeout(resolve, 2000))

    if (!fs.existsSync(folderPath)) {
      console.log("Folder not found even after wait:", folderPath);
      return res.status(500).json({ error: 'Download failed or folder not found', folderPath });
    }

    // ZIP folder
    const zipName = `${playlistTitle}.zip`;
    const zipPath = path.join(__dirname, zipName);

    await zipFolder(folderPath, zipPath);

    res.json({
      playlist: playlistTitle,
      zipFile: zipName
    });

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to download.' });
  }
});

// Helper function untuk zip folder
function zipFolder(source, out) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(out);

    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

// Endpoint serve zip
app.get('/zip/:zipname', (req, res) => {
  const zipPath = path.join(__dirname, req.params.zipname);
  if (!fs.existsSync(zipPath)) {
    return res.status(404).send('Zip not found');
  }
  res.download(zipPath);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});