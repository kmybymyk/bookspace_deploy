#!/usr/bin/env python3

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import re
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any
from xml.etree import ElementTree as ET


XHTML_NS = {"x": "http://www.w3.org/1999/xhtml"}
OPF_NS = {
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
}
NCX_NS = {"n": "http://www.daisy.org/z3986/2005/ncx/"}

SKIP_FILENAMES = {
    "cover.xhtml",
    "titlepage.xhtml",
    "back-cover.xhtml",
    "toc.xhtml",
    "section0000.xhtml",
}
BACK_FILENAMES = {"colophon.xhtml"}


def normalize_path(path: str) -> str:
    return str(PurePosixPath(path))


def strip_fragment(href: str) -> str:
    return href.split("#", 1)[0].split("?", 1)[0]


def basename(path: str) -> str:
    return PurePosixPath(path).name


def slugify(value: str, fallback: str) -> str:
    lowered = value.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    return slug or fallback


def guess_identifier_type(identifier: str) -> str:
    digits = re.sub(r"[^0-9Xx]", "", identifier)
    if len(digits) in {10, 13}:
        return "isbn"
    return "uuid"


def make_text_node(text: str) -> dict[str, Any]:
    return {"type": "text", "text": text}


def make_paragraph(text: str) -> dict[str, Any]:
    cleaned = " ".join(text.split())
    if not cleaned:
        return {"type": "paragraph"}
    return {"type": "paragraph", "content": [make_text_node(cleaned)]}


def make_doc(content: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "doc", "content": content or [{"type": "paragraph"}]}


def data_url_for_bytes(raw: bytes, path: str) -> str:
    mime_type, _ = mimetypes.guess_type(path)
    mime = mime_type or "application/octet-stream"
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{encoded}"


@dataclass
class TocPart:
    title: str
    src_path: str
    child_titles: list[str]
    child_paths: list[str]


class EpubToBkspConverter:
    def __init__(self, epub_path: str) -> None:
        self.epub_path = epub_path
        self.zip_file = zipfile.ZipFile(epub_path)
        self.opf_path = self._find_opf_path()
        self.opf_dir = str(PurePosixPath(self.opf_path).parent)
        self.manifest = self._parse_manifest()
        self.spine = self._parse_spine()
        self.spine_index = {path: index for index, path in enumerate(self.spine)}
        self.toc_parts = self._parse_toc_parts()

    def close(self) -> None:
        self.zip_file.close()

    def _find_opf_path(self) -> str:
        container_xml = self.zip_file.read("META-INF/container.xml")
        root = ET.fromstring(container_xml)
        rootfile = root.find(".//{*}rootfile")
        if rootfile is None:
            raise ValueError("OPF path not found in container.xml")
        full_path = rootfile.attrib.get("full-path", "").strip()
        if not full_path:
            raise ValueError("OPF full-path is empty")
        return normalize_path(full_path)

    def _resolve_href(self, href: str) -> str:
        base = PurePosixPath(self.opf_dir)
        return normalize_path(str((base / href).as_posix()))

    def _parse_manifest(self) -> dict[str, dict[str, str]]:
        root = ET.fromstring(self.zip_file.read(self.opf_path))
        manifest: dict[str, dict[str, str]] = {}
        for item in root.findall(".//opf:manifest/opf:item", OPF_NS):
            item_id = item.attrib.get("id", "")
            href = item.attrib.get("href", "")
            if not item_id or not href:
                continue
            manifest[item_id] = {
                "href": self._resolve_href(href),
                "media-type": item.attrib.get("media-type", ""),
                "properties": item.attrib.get("properties", ""),
            }
        return manifest

    def _parse_spine(self) -> list[str]:
        root = ET.fromstring(self.zip_file.read(self.opf_path))
        ordered: list[str] = []
        for itemref in root.findall(".//opf:spine/opf:itemref", OPF_NS):
            idref = itemref.attrib.get("idref", "")
            manifest_item = self.manifest.get(idref)
            if not manifest_item:
                continue
            href = manifest_item["href"]
            if href.endswith((".xhtml", ".html", ".htm")):
                ordered.append(href)
        return ordered

    def _find_ncx_path(self) -> str | None:
        root = ET.fromstring(self.zip_file.read(self.opf_path))
        for item in root.findall(".//opf:manifest/opf:item", OPF_NS):
            media_type = item.attrib.get("media-type", "")
            if media_type == "application/x-dtbncx+xml":
                return self._resolve_href(item.attrib.get("href", ""))
        return None

    def _parse_toc_parts(self) -> list[TocPart]:
        ncx_path = self._find_ncx_path()
        if not ncx_path:
            return []
        root = ET.fromstring(self.zip_file.read(ncx_path))
        nav_map = root.find("n:navMap", NCX_NS)
        if nav_map is None:
            return []
        parts: list[TocPart] = []
        for nav_point in nav_map.findall("n:navPoint", NCX_NS):
            label = "".join(nav_point.findtext("n:navLabel/n:text", default="", namespaces=NCX_NS)).strip()
            src = nav_point.find("n:content", NCX_NS)
            src_path = self._resolve_href(strip_fragment(src.attrib.get("src", ""))) if src is not None else ""
            child_titles: list[str] = []
            child_paths: list[str] = []
            for child in nav_point.findall("n:navPoint", NCX_NS):
                child_label = child.findtext("n:navLabel/n:text", default="", namespaces=NCX_NS).strip()
                child_src = child.find("n:content", NCX_NS)
                child_path = (
                    self._resolve_href(strip_fragment(child_src.attrib.get("src", "")))
                    if child_src is not None
                    else ""
                )
                if child_label and child_path:
                    child_titles.append(child_label)
                    child_paths.append(child_path)
            if label and src_path:
                parts.append(TocPart(label, src_path, child_titles, child_paths))
        return parts

    def _read_xml(self, path: str) -> ET.Element:
        return ET.fromstring(self.zip_file.read(path))

    def _read_metadata(self) -> dict[str, Any]:
        root = ET.fromstring(self.zip_file.read(self.opf_path))
        title = root.findtext(".//dc:title", default="", namespaces=OPF_NS).strip()
        creator = root.findtext(".//dc:creator", default="", namespaces=OPF_NS).strip()
        identifier = root.findtext(".//dc:identifier", default="", namespaces=OPF_NS).strip()
        language = root.findtext(".//dc:language", default="ko", namespaces=OPF_NS).strip() or "ko"
        publisher = root.findtext(".//dc:publisher", default="", namespaces=OPF_NS).strip()
        publish_date = root.findtext(".//dc:date", default="", namespaces=OPF_NS).strip()

        cover_image = None
        for item in self.manifest.values():
            if "cover-image" in item.get("properties", "").split():
                cover_image = data_url_for_bytes(self.zip_file.read(item["href"]), item["href"])
                break

        metadata: dict[str, Any] = {
            "title": title,
            "subtitle": "",
            "authors": [{"id": "author-1", "name": creator, "role": "author"}] if creator else [],
            "identifierType": guess_identifier_type(identifier) if identifier else "isbn",
            "identifier": identifier,
            "isbn": identifier if guess_identifier_type(identifier) == "isbn" else "",
            "language": language,
            "publisher": publisher,
            "publishDate": publish_date,
            "link": "",
            "description": "",
        }
        if cover_image:
            metadata["coverImage"] = cover_image
        return metadata

    def _resolve_asset_href(self, chapter_path: str, src: str) -> str | None:
        cleaned = strip_fragment(src).strip()
        if not cleaned or cleaned.startswith(("http://", "https://", "data:", "#")):
            return cleaned or None
        chapter_dir = PurePosixPath(chapter_path).parent
        resolved = normalize_path(str((chapter_dir / cleaned).as_posix()))
        return resolved

    def _inline_text(self, element: ET.Element) -> str:
        return " ".join(" ".join(element.itertext()).split())

    def _parse_block(self, element: ET.Element, chapter_path: str) -> list[dict[str, Any]]:
        tag = element.tag.rsplit("}", 1)[-1].lower()

        if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            level = max(1, min(6, int(tag[1])))
            text = self._inline_text(element)
            if not text:
                return []
            return [{"type": "heading", "attrs": {"level": level}, "content": [make_text_node(text)]}]

        if tag == "p":
            text = self._inline_text(element)
            image_children = [child for child in list(element) if child.tag.rsplit("}", 1)[-1].lower() == "img"]
            nodes = [make_paragraph(text)] if text else []
            for image in image_children:
                nodes.extend(self._parse_block(image, chapter_path))
            return nodes or [{"type": "paragraph"}]

        if tag == "img":
            src = element.attrib.get("src", "").strip()
            resolved_src = self._resolve_asset_href(chapter_path, src)
            if not resolved_src:
                return []
            final_src = resolved_src
            if not final_src.startswith(("http://", "https://", "data:")):
                final_src = data_url_for_bytes(self.zip_file.read(final_src), final_src)
            attrs = {"src": final_src, "alt": element.attrib.get("alt", "")}
            return [{"type": "image", "attrs": attrs}]

        if tag in {"blockquote"}:
            inner = self._parse_children(element, chapter_path)
            return [{"type": "blockquote", "content": inner or [{"type": "paragraph"}]}]

        if tag in {"ul", "ol"}:
            item_type = "orderedList" if tag == "ol" else "bulletList"
            items: list[dict[str, Any]] = []
            for child in list(element):
                if child.tag.rsplit("}", 1)[-1].lower() != "li":
                    continue
                item_nodes = self._parse_children(child, chapter_path)
                items.append({"type": "listItem", "content": item_nodes or [{"type": "paragraph"}]})
            return [{"type": item_type, "content": items}] if items else []

        if tag == "hr":
            return [{"type": "horizontalRule"}]

        if tag in {"figure", "div", "section", "article", "body"}:
            return self._parse_children(element, chapter_path)

        if tag == "li":
            return self._parse_children(element, chapter_path)

        text = self._inline_text(element)
        return [make_paragraph(text)] if text else []

    def _parse_children(self, element: ET.Element, chapter_path: str) -> list[dict[str, Any]]:
        content: list[dict[str, Any]] = []
        if element.text and element.text.strip():
            content.append(make_paragraph(element.text))
        for child in list(element):
            content.extend(self._parse_block(child, chapter_path))
            if child.tail and child.tail.strip():
                content.append(make_paragraph(child.tail))
        return content

    def _parse_doc(self, chapter_path: str) -> dict[str, Any]:
        root = self._read_xml(chapter_path)
        body = root.find(".//x:body", XHTML_NS)
        if body is None:
            return make_doc([])
        return make_doc(self._parse_children(body, chapter_path))

    def _chapter_title(self, chapter_path: str) -> str:
        root = self._read_xml(chapter_path)
        title = root.findtext(".//x:title", default="", namespaces=XHTML_NS).strip()
        if title:
            return title.replace(" (intro)", "").strip()
        return PurePosixPath(chapter_path).stem

    def _part_opener_cluster(self, part: TocPart, next_part_path: str | None) -> list[str]:
        start = self.spine_index.get(part.src_path)
        if start is None:
            return []
        next_main_index = min(
            (self.spine_index[path] for path in part.child_paths if path in self.spine_index),
            default=None,
        )
        if next_main_index is not None:
            end = next_main_index
        elif next_part_path and next_part_path in self.spine_index:
            end = self.spine_index[next_part_path]
        else:
            end = len(self.spine)
        return self.spine[start:end]

    def _intro_paths_for_children(self, part: TocPart) -> dict[str, list[str]]:
        assigned: dict[str, list[str]] = {path: [] for path in part.child_paths}
        child_set = set(part.child_paths)
        opener_set = {part.src_path}
        for child_path in part.child_paths:
            index = self.spine_index.get(child_path)
            if index is None:
                continue
            cursor = index - 1
            intro_paths: list[str] = []
            while cursor >= 0:
                candidate = self.spine[cursor]
                if candidate in child_set or candidate in opener_set:
                    break
                if basename(candidate).lower() in SKIP_FILENAMES or basename(candidate).lower() in BACK_FILENAMES:
                    break
                intro_paths.insert(0, candidate)
                cursor -= 1
                if intro_paths and not basename(candidate).lower().endswith(("q.xhtml", "intro.xhtml")):
                    break
            assigned[child_path] = intro_paths
        return assigned

    def _chapter_cluster(
        self,
        part: TocPart,
        chapter_path: str,
        intro_map: dict[str, list[str]],
        future_intro_paths: set[str],
        next_part_path: str | None,
    ) -> list[str]:
        index = self.spine_index.get(chapter_path)
        if index is None:
            return []
        cluster = list(intro_map.get(chapter_path, []))
        cluster.append(chapter_path)
        cursor = index + 1
        stop_index = self.spine_index.get(next_part_path, len(self.spine)) if next_part_path else len(self.spine)
        child_set = set(part.child_paths)
        while cursor < stop_index:
            candidate = self.spine[cursor]
            if candidate in child_set:
                break
            if candidate in future_intro_paths:
                break
            lower_name = basename(candidate).lower()
            if lower_name in SKIP_FILENAMES or lower_name in BACK_FILENAMES:
                break
            cluster.append(candidate)
            cursor += 1
        return cluster

    def _merge_docs(self, paths: list[str]) -> dict[str, Any]:
        merged: list[dict[str, Any]] = []
        seen = set()
        for path in paths:
            if path in seen:
                continue
            seen.add(path)
            doc = self._parse_doc(path)
            merged.extend(doc.get("content", []))
        return make_doc(merged)

    def _make_chapter_entry(
        self,
        *,
        chapter_id: str,
        title: str,
        order: int,
        file_name: str,
        chapter_type: str,
        chapter_kind: str,
        parent_id: str | None,
        content_paths: list[str],
    ) -> dict[str, Any]:
        return {
            "id": chapter_id,
            "title": title,
            "content": self._merge_docs(content_paths),
            "order": order,
            "fileName": file_name,
            "chapterType": chapter_type,
            "chapterKind": chapter_kind,
            "parentId": parent_id,
        }

    def build_project(self) -> dict[str, Any]:
        metadata = self._read_metadata()
        chapters: list[dict[str, Any]] = []
        order = 0

        prologue_path = next((path for path in self.spine if basename(path) == "front-prologue.xhtml"), None)
        if prologue_path:
            chapters.append(
                self._make_chapter_entry(
                    chapter_id="front-prologue",
                    title="프롤로그",
                    order=order,
                    file_name="front-prologue.xhtml",
                    chapter_type="front",
                    chapter_kind="prologue",
                    parent_id=None,
                    content_paths=[prologue_path],
                )
            )
            order += 1

        for part_index, part in enumerate(self.toc_parts, start=1):
            next_part_path = self.toc_parts[part_index].src_path if part_index < len(self.toc_parts) else None
            part_id = f"part-{part_index:02d}"
            part_paths = self._part_opener_cluster(part, next_part_path)
            chapters.append(
                self._make_chapter_entry(
                    chapter_id=part_id,
                    title=part.title,
                    order=order,
                    file_name=f"{slugify(part.title, part_id)}.xhtml",
                    chapter_type="part",
                    chapter_kind="part",
                    parent_id=None,
                    content_paths=part_paths,
                )
            )
            order += 1

            intro_map = self._intro_paths_for_children(part)
            for child_idx, child_path in enumerate(part.child_paths):
                future_intro_paths = {
                    intro
                    for later_path, intros in intro_map.items()
                    if later_path != child_path
                    for intro in intros
                }
                cluster = self._chapter_cluster(part, child_path, intro_map, future_intro_paths, next_part_path)
                child_title = part.child_titles[child_idx] if child_idx < len(part.child_titles) else self._chapter_title(child_path)
                child_id = f"{part_id}-chapter-{child_idx + 1:02d}"
                chapters.append(
                    self._make_chapter_entry(
                        chapter_id=child_id,
                        title=child_title,
                        order=order,
                        file_name=f"{slugify(child_title, child_id)}.xhtml",
                        chapter_type="chapter",
                        chapter_kind="chapter",
                        parent_id=part_id,
                        content_paths=cluster,
                    )
                )
                order += 1

        handled_paths = {prologue_path} if prologue_path else set()
        for part in self.toc_parts:
            handled_paths.add(part.src_path)
            handled_paths.update(part.child_paths)
            for child_paths in self._intro_paths_for_children(part).values():
                handled_paths.update(child_paths)
            next_part_index = self.toc_parts.index(part) + 1
            next_part_path = self.toc_parts[next_part_index].src_path if next_part_index < len(self.toc_parts) else None
            for child_path in part.child_paths:
                handled_paths.update(
                    self._chapter_cluster(
                        part,
                        child_path,
                        self._intro_paths_for_children(part),
                        set(),
                        next_part_path,
                    )
                )

        for path in self.spine:
            lower_name = basename(path).lower()
            if path in handled_paths or lower_name in SKIP_FILENAMES:
                continue
            if lower_name in BACK_FILENAMES:
                chapters.append(
                    self._make_chapter_entry(
                        chapter_id="back-colophon",
                        title="판권",
                        order=order,
                        file_name="colophon.xhtml",
                        chapter_type="back",
                        chapter_kind="colophon",
                        parent_id=None,
                        content_paths=[path],
                    )
                )
                order += 1
                continue
            if lower_name.startswith("front-chapter-"):
                continue
            title = self._chapter_title(path)
            chapters.append(
                self._make_chapter_entry(
                    chapter_id=f"extra-{order:02d}",
                    title=title,
                    order=order,
                    file_name=f"{slugify(title, f'extra-{order:02d}')}.xhtml",
                    chapter_type="chapter",
                    chapter_kind="chapter",
                    parent_id=None,
                    content_paths=[path],
                )
            )
            order += 1

        return {
            "version": "0.1.0",
            "metadata": metadata,
            "chapters": chapters,
            "designSettings": {},
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert an EPUB file into a BookSpace .bksp project.")
    parser.add_argument("input", help="Path to the source EPUB file")
    parser.add_argument(
        "-o",
        "--output",
        help="Path to write the output .bksp file. Defaults to the input path with a .bksp extension.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = args.input
    output_path = args.output or re.sub(r"\.epub$", ".bksp", input_path, flags=re.IGNORECASE)
    if output_path == input_path:
        output_path = f"{input_path}.bksp"

    converter = EpubToBkspConverter(input_path)
    try:
        project = converter.build_project()
    finally:
        converter.close()

    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(project, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    print(json.dumps({"input": input_path, "output": output_path, "chapters": len(project["chapters"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
