# Kolo Sport TV

## Video delivery

Source videos stay in `videos/`. The GitHub Actions Pages workflow uses FFmpeg to build:

- HLS streams at up to 1080p, 720p, 480p, and 360p, with four-second segments.
- A compressed, fast-start 720p MP4 fallback for browsers without HLS support.

Generated media is placed in the Pages artifact, not committed to the repository. HLS.js is loaded from jsDelivr only when a video approaches the viewport; Safari uses native HLS where available.

To publish, set the repository's Pages build source to **GitHub Actions**. The workflow deploys on pushes to `master` and can also be started manually.

To build the media locally, install FFmpeg (including `ffprobe`) and run:

```sh
python scripts/build_hls.py --input-dir videos --output-dir dist/videos
```
