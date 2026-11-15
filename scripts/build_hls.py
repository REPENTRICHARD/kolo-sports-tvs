#!/usr/bin/env python3

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path


RENDITION_PROFILES = (
    {"height": 1080, "bitrate": 2500, "maxrate": 3000},
    {"height": 720, "bitrate": 1100, "maxrate": 1400},
    {"height": 480, "bitrate": 550, "maxrate": 750},
    {"height": 360, "bitrate": 300, "maxrate": 450},
)
AUDIO_BITRATE = 64
SEGMENT_SECONDS = 4


def run(command):
    subprocess.run(command, check=True)


def probe_video(ffprobe, source):
    result = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "json",
            str(source),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    streams = json.loads(result.stdout).get("streams", [])
    if not streams:
        raise ValueError(f"No video stream found in {source}")
    return streams[0]["width"], streams[0]["height"]


def scale_dimensions(width, height, max_height):
    scale = min(1, 1920 / width, max_height / height)
    output_width = max(2, int(width * scale) // 2 * 2)
    output_height = max(2, int(height * scale) // 2 * 2)
    return output_width, output_height


def bitrate_for_height(height):
    for profile in RENDITION_PROFILES:
        if height >= profile["height"]:
            return profile
    return {"height": height, "bitrate": 300, "maxrate": 400}


def source_key(source):
    key = re.sub(r"[^a-z0-9-]+", "-", source.stem.lower()).strip("-")
    if not key:
        raise ValueError(f"Could not create a safe output name from {source.name}")
    return key


def encode_hls_rendition(ffmpeg, source, output_dir, profile, dimensions):
    width, height = dimensions
    name = f"{height}p"
    rendition_dir = output_dir / name
    rendition_dir.mkdir(parents=True, exist_ok=True)
    video_bitrate = profile["bitrate"]
    maxrate = profile["maxrate"]
    playlist = rendition_dir / "playlist.m3u8"
    segment_pattern = rendition_dir / "segment_%05d.ts"

    run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "warning",
            "-nostats",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            f"scale={width}:{height}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-b:v",
            f"{video_bitrate}k",
            "-maxrate",
            f"{maxrate}k",
            "-bufsize",
            f"{maxrate * 2}k",
            "-sc_threshold",
            "0",
            "-force_key_frames",
            f"expr:gte(t,n_forced*{SEGMENT_SECONDS})",
            "-c:a",
            "aac",
            "-b:a",
            f"{AUDIO_BITRATE}k",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-f",
            "hls",
            "-hls_time",
            str(SEGMENT_SECONDS),
            "-hls_playlist_type",
            "vod",
            "-hls_flags",
            "independent_segments",
            "-hls_segment_filename",
            str(segment_pattern),
            str(playlist),
        ]
    )
    return {
        "name": name,
        "width": width,
        "height": height,
        "bandwidth": (maxrate + AUDIO_BITRATE) * 1000,
        "average_bandwidth": (video_bitrate + AUDIO_BITRATE) * 1000,
    }


def write_master_playlist(output_dir, renditions):
    lines = ["#EXTM3U", "#EXT-X-VERSION:6", "#EXT-X-INDEPENDENT-SEGMENTS"]
    for rendition in renditions:
        lines.extend(
            [
                (
                    "#EXT-X-STREAM-INF:"
                    f"BANDWIDTH={rendition['bandwidth']},"
                    f"AVERAGE-BANDWIDTH={rendition['average_bandwidth']},"
                    f"RESOLUTION={rendition['width']}x{rendition['height']}"
                ),
                f"{rendition['name']}/playlist.m3u8",
            ]
        )
    (output_dir / "master.m3u8").write_text("\n".join(lines) + "\n", encoding="utf-8")


def encode_mp4_fallback(ffmpeg, source, output, source_width, source_height):
    profile = bitrate_for_height(min(720, source_height))
    dimensions = scale_dimensions(source_width, source_height, min(720, source_height))
    output.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "warning",
            "-nostats",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            f"scale={dimensions[0]}:{dimensions[1]}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "23",
            "-maxrate",
            f"{profile['maxrate']}k",
            "-bufsize",
            f"{profile['maxrate'] * 2}k",
            "-c:a",
            "aac",
            "-b:a",
            f"{AUDIO_BITRATE}k",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-movflags",
            "+faststart",
            str(output),
        ]
    )


def build_video(ffmpeg, ffprobe, source, output_dir):
    width, height = probe_video(ffprobe, source)
    key = source_key(source)
    stream_dir = output_dir / "hls" / key
    if stream_dir.exists():
        shutil.rmtree(stream_dir)
    stream_dir.mkdir(parents=True)

    profiles = [profile for profile in RENDITION_PROFILES if profile["height"] <= height]
    if not profiles:
        profiles = [bitrate_for_height(height)]

    renditions = []
    seen_dimensions = set()
    for profile in profiles:
        dimensions = scale_dimensions(width, height, profile["height"])
        if dimensions in seen_dimensions:
            continue
        seen_dimensions.add(dimensions)
        renditions.append(encode_hls_rendition(ffmpeg, source, stream_dir, profile, dimensions))

    write_master_playlist(stream_dir, renditions)
    encode_mp4_fallback(ffmpeg, source, output_dir / f"{key}.mp4", width, height)
    print(f"Built compressed MP4 and {len(renditions)} HLS renditions for {source.name}")


def main():
    parser = argparse.ArgumentParser(description="Build compressed MP4 and adaptive HLS videos.")
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()
    if input_dir == output_dir:
        parser.error("--output-dir must not be the same as --input-dir")

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        parser.error("Both ffmpeg and ffprobe must be installed and available on PATH")

    sources = sorted(input_dir.glob("*.mp4"))
    if not sources:
        parser.error(f"No MP4 files found in {input_dir}")

    for source in sources:
        build_video(ffmpeg, ffprobe, source, output_dir)


if __name__ == "__main__":
    main()
