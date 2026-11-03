"""Podcast RSS import for the listening player.

The feed is the public RSS that podcast apps read (SoundCloud hosts the Dalilk IELTS
podcast). The Electron shell downloads it; this module only parses text it is given.
Each episode's description links its transcript on Google Drive; only the file id is
kept and the transcript is shown from Drive itself (nothing is copied).
"""

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

ITUNES = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"
DRIVE_ID = re.compile(r"https://drive\.google\.com/(?:file/d/|open\?id=)([A-Za-z0-9_-]{10,100})")
NUMBER = re.compile(r"#\s*(\d{1,5})")
SAFE_URL = re.compile(r"^https://[^\s\"'<>]{1,990}$")
MAX_SUMMARY = 2000


class FeedError(ValueError):
    pass


@dataclass
class ParsedEpisode:
    guid: str
    title: str
    number: int | None
    published_at: datetime | None
    duration_seconds: int | None
    audio_url: str
    page_url: str | None
    transcript_id: str | None
    summary: str


def parse_duration(text: str | None) -> int | None:
    if not text:
        return None
    text = text.strip()
    try:
        if ":" in text:
            seconds = 0
            for part in text.split(":"):
                seconds = seconds * 60 + int(part)
            return seconds
        return int(float(text))
    except ValueError:
        return None


def _date(text: str | None) -> datetime | None:
    if not text:
        return None
    try:
        value = parsedate_to_datetime(text.strip())
    except (TypeError, ValueError):
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def parse_feed(xml_text: str) -> list[ParsedEpisode]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise FeedError(f"not a valid RSS document: {exc}") from exc
    channel = root.find("channel")
    if channel is None:
        raise FeedError("RSS channel missing")
    episodes: list[ParsedEpisode] = []
    for item in channel.findall("item"):
        enclosure = item.find("enclosure")
        audio = (enclosure.get("url") if enclosure is not None else "") or ""
        if not SAFE_URL.match(audio):
            continue
        title = (item.findtext("title") or "").strip()[:300]
        guid = (item.findtext("guid") or audio).strip()[:300]
        description = item.findtext("description") or item.findtext(f"{ITUNES}summary") or ""
        drive = DRIVE_ID.search(description)
        link = (item.findtext("link") or "").strip()
        number = NUMBER.search(title)
        episodes.append(
            ParsedEpisode(
                guid=guid,
                title=title or guid,
                number=int(number.group(1)) if number else None,
                published_at=_date(item.findtext("pubDate")),
                duration_seconds=parse_duration(item.findtext(f"{ITUNES}duration")),
                audio_url=audio,
                page_url=link if SAFE_URL.match(link) else None,
                transcript_id=drive.group(1) if drive else None,
                summary=_strip_html(description)[:MAX_SUMMARY],
            )
        )
    return episodes
