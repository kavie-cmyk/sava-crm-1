#!/usr/bin/env python3
"""Sinh seed-market.sql từ publishing-data.js (nguồn sự thật tĩnh duy nhất).

Chạy:  python3 supabase/generate-seed-market.py
Đọc:   ../publishing-data.js  (window.PublishingData = {...};)
Ghi:   ./seed-market.sql      (idempotent: on conflict do update)

KHÔNG sửa tay seed-market.sql — muốn đổi dữ liệu tĩnh thì đổi nguồn
(publishing-data.js qua tools/import-market.py + build-publishing-data.py)
rồi chạy lại script này. Chỉ dùng thư viện chuẩn.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "publishing-data.js"
OUT = HERE / "seed-market.sql"


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    if v is None or isinstance(v, bool) or not isinstance(v, (int, float)):
        return "NULL"
    return repr(float(v))


def sql_json(v):
    if v is None:
        return "NULL"
    return sql_str(json.dumps(v, ensure_ascii=False)) + "::jsonb"


def main():
    text = SRC.read_text(encoding="utf-8")
    payload = json.loads(text.split("=", 1)[1].strip().rstrip(";"))
    records = payload["records"]

    lines = []
    lines.append("-- ============================================================================")
    lines.append("-- Sava Meta CRM — Seed dữ liệu thị trường TĨNH (sinh TỰ ĐỘNG, đừng sửa tay)")
    lines.append("-- Nguồn: publishing-data.js (window.PublishingData) — sinh bởi")
    lines.append("-- supabase/generate-seed-market.py. Chạy SAU schema.sql + policies.sql.")
    lines.append("-- Idempotent: chạy lại = upsert theo khoá chính, không nhân đôi dữ liệu.")
    lines.append("-- ============================================================================")
    lines.append("")
    lines.append("insert into public.market_datasets")
    lines.append("  (version, source_file, source_sha256, imported_at, allowed_sheets, enrichment, framework)")
    lines.append("values (")
    lines.append(
        "  {ver}, {src}, {sha}, {imp}, {sheets}, {enr}, {fw}".format(
            ver=sql_str(payload.get("version")),
            src=sql_str(payload.get("source")),
            sha=sql_str(payload.get("sourceSha256")),
            imp=sql_str(payload.get("importedAt")),
            sheets=sql_json(payload.get("allowedSheets", [])),
            enr=sql_str(payload.get("enrichment")),
            fw=sql_json(payload.get("framework")),
        )
    )
    lines.append(")")
    lines.append("on conflict (version) do update set")
    lines.append("  source_file = excluded.source_file, source_sha256 = excluded.source_sha256,")
    lines.append("  imported_at = excluded.imported_at, allowed_sheets = excluded.allowed_sheets,")
    lines.append("  enrichment = excluded.enrichment, framework = excluded.framework;")
    lines.append("")

    cols = ("id, dataset_version, name, category, geo, platform, snapshot_date, "
            "downloads, revenue, top1, top3, top5, newcomer, free_titles, "
            "grossing_titles, new_launches, titles_count, evidence_type_raw, "
            "confidence, source_url, note, history_period, history_note, "
            "cpi_scope, payload")
    for r in records:
        vals = [
            sql_str(r.get("id")),
            sql_str(payload.get("version")),
            sql_str(r.get("name")),
            sql_str(r.get("category")),
            sql_str(r.get("geo")),
            sql_str(r.get("platform")),
            sql_str(r.get("date")),
            sql_num(r.get("downloads")),
            sql_num(r.get("revenue")),
            sql_num(r.get("top1")),
            sql_num(r.get("top3")),
            sql_num(r.get("top5")),
            sql_num(r.get("newcomer")),
            sql_num(r.get("freeTitles")),
            sql_num(r.get("grossingTitles")),
            sql_num(r.get("newLaunches")),
            sql_num(r.get("titles")),
            sql_str(r.get("evidenceType")),
            sql_num(r.get("confidence")),
            sql_str(r.get("url")),
            sql_str(r.get("note")),
            sql_str(r.get("historyPeriod")),
            sql_str(r.get("historyNote")),
            sql_str(r.get("cpiScope")),
            sql_json(r),
        ]
        lines.append(f"insert into public.market_records ({cols})")
        lines.append("values (" + ", ".join(vals) + ")")
        lines.append("on conflict (id) do update set")
        lines.append("  dataset_version = excluded.dataset_version, name = excluded.name,")
        lines.append("  category = excluded.category, geo = excluded.geo, platform = excluded.platform,")
        lines.append("  snapshot_date = excluded.snapshot_date, downloads = excluded.downloads,")
        lines.append("  revenue = excluded.revenue, top1 = excluded.top1, top3 = excluded.top3,")
        lines.append("  top5 = excluded.top5, newcomer = excluded.newcomer,")
        lines.append("  free_titles = excluded.free_titles, grossing_titles = excluded.grossing_titles,")
        lines.append("  new_launches = excluded.new_launches, titles_count = excluded.titles_count,")
        lines.append("  evidence_type_raw = excluded.evidence_type_raw, confidence = excluded.confidence,")
        lines.append("  source_url = excluded.source_url, note = excluded.note,")
        lines.append("  history_period = excluded.history_period, history_note = excluded.history_note,")
        lines.append("  cpi_scope = excluded.cpi_scope, payload = excluded.payload;")
        lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK: {len(records)} records -> {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
