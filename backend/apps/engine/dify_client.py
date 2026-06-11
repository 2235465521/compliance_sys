"""
Dify Workflow 应用 API 客户端（工作流 ①②③ blocking 调用）。

与官方文档对齐的要点：
- Base URL 含 `/v1`，例如 `http://192.168.10.225/v1`
- `Authorization: Bearer {API_KEY}`
- 先 `POST /files/upload`（multipart：file + user），再 `POST /workflows/run` 或 `POST /workflows/{workflow_id}/run`
- 文件传参：不同 Dify 版本对工作流 `POST .../run` 的校验不同。`DIFY_WORKFLOW1_FILE_PAYLOAD_MODE` 控制形态（默认 **`inputs_single`**：`inputs` 里单文件对象，满足「input form 必填」类校验）。可选 `inputs`（数组）、`files`（仅顶层 files）、`both`（inputs 单对象 + files 同时带）。
- 工作流 ① 建议使用 `response_mode=blocking`（流式需在 engine 内解析 SSE，后续可加）

- Dify 工作流 ① 约定输出：① **`outputs` 根级**即为企标对象（`qb_id`、`qb_name`、`company_name`、`qibiao_release_date`、`indexes[]`、`references[]` 等，与内层同构）；② 或 **`outputs` 中含 `QB_init_info`**（JSON 字符串或对象），内层字段同上。见 `compliance.schemas.dify_contracts.DifyWorkflow1QBInitInner`。
- DIFY_WORKFLOW1_OUTPUT_WRAPPER_KEY：可选，默认 `QB_init_info`；若 Dify 改名可配置。

环境变量：
- DIFY_API_BASE：必填（启用真连时），如 `http://192.168.10.225/v1`
- DIFY_API_KEY：必填
- DIFY_WORKFLOW_1_ID：可选；若设置则请求 `POST .../workflows/{id}/run`（指定已发布版本），否则 `POST .../workflows/run`（当前应用默认已发布工作流）
- DIFY_WORKFLOW1_FILES_INPUT_KEY：必填（启用真连时），与 Dify 应用「开始」中文件变量的 variable 名一致
- DIFY_WORKFLOW1_FILE_PAYLOAD_MODE：可选，`inputs_single`（默认，`inputs` 内单对象）、`inputs`（`inputs` 内数组）、`files`（仅顶层 `files`）、`both`（单对象 + `files` 双写）。若报「XX is required in input form」用默认；若报「must be a file」可试 `files` 或 `both`。
- DIFY_WORKFLOW1_RESPONSE_MODE：可选，`blocking`（默认）或 `streaming`（未实现，配置了会回退为 blocking 并可在日志中提示）
- DIFY_HTTP_TIMEOUT_SECONDS：可选，对 `files/upload` 与 `workflows/run` 的 httpx 超时秒数（默认 300）
- DIFY_LOG_RESPONSE_TO_TERMINAL：可选，默认 `true`；为 `false` 时不向 stderr 打印工作流 run 的原始 JSON。
- DIFY_LOG_RESPONSE_MAX_CHARS：可选，默认 `200000`；超出则截断并提示；设为 `0` 表示不截断。

批量规范性引用评价（独立应用，与 DIFY_API_KEY 分离）：
- BATCH_NORMATIVE_REF_DIFY_API_BASE：可选；未设时回退为 DIFY_API_BASE
- BATCH_NORMATIVE_REF_DIFY_API_KEY：必填（启用该功能真连时）
- BATCH_NORMATIVE_REF_FILES_INPUT_KEY：默认 `QB_file`
- BATCH_NORMATIVE_REF_FILE_PAYLOAD_MODE：可选，同 DIFY_WORKFLOW1_FILE_PAYLOAD_MODE
- BATCH_NORMATIVE_REF_WORKFLOW_ID：可选；空则 `POST /workflows/run`
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
from pathlib import Path
from typing import Any

import httpx

try:
    from dotenv import load_dotenv as _load_dotenv
    _load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env", override=True)
except Exception:
    pass


class DifyApiError(RuntimeError):
    """Dify HTTP 或业务状态错误。"""

    def __init__(self, message: str, *, status_code: int | None = None, body: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.body = body

    def __str__(self) -> str:
        base = self.args[0] if self.args else ""
        if self.body:
            tail = self.body.strip()
            if len(tail) > 1500:
                tail = tail[:1500] + "…"
            return f"{base} | response={tail}"
        return str(base)


def _print_dify_workflow_response_to_terminal(err_label: str, payload: dict[str, Any]) -> None:
    """开发期将 Dify `workflows/run` 成功后的完整 JSON 打到 stderr（runserver 终端可见）。"""
    flag = (os.environ.get("DIFY_LOG_RESPONSE_TO_TERMINAL", "true") or "true").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return
    try:
        text = json.dumps(payload, ensure_ascii=False, default=str)
    except TypeError:
        text = str(payload)
    max_chars_raw = (os.environ.get("DIFY_LOG_RESPONSE_MAX_CHARS", "200000") or "200000").strip()
    try:
        max_chars = int(max_chars_raw)
    except ValueError:
        max_chars = 200_000
    truncated = ""
    if max_chars > 0 and len(text) > max_chars:
        text = text[:max_chars]
        truncated = "\n…[已截断：DIFY_LOG_RESPONSE_MAX_CHARS]"
    print(
        f"\n======== Dify 工作流 {err_label} 原始响应（HTTP 200 JSON）========\n{text}{truncated}\n========\n",
        file=sys.stderr,
        flush=True,
    )


def _mime_for_compliance_document(path: Path) -> str:
    """企标多为 PDF/Word；补全 mimetypes 在 Windows 上可能缺失的映射。"""
    ext = path.suffix.lower()
    manual = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    if ext in manual:
        return manual[ext]
    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "application/octet-stream"


def _parse_json_string_field(raw: str, field_name: str) -> dict[str, Any]:
    try:
        out = json.loads(raw.strip())
    except json.JSONDecodeError as e:
        raise DifyApiError(f"{field_name} 不是合法 JSON 字符串: {e}") from e
    if not isinstance(out, dict):
        raise DifyApiError(f"{field_name} 解析后应为 JSON 对象，实际为 {type(out)}")
    return out


def _normalize_workflow1_references(refs_raw: Any) -> tuple[list[str], list[dict[str, Any]]]:
    """从 Dify 引用字段得到标准号列表 + 逐条提取详情（供 parse_result.references_detail）。"""
    ref_list: list[str] = []
    detail: list[dict[str, Any]] = []
    if refs_raw is None:
        return [], []
    if isinstance(refs_raw, str):
        s = refs_raw.strip()
        if not s:
            return [], []
        for p in re.split(r"\s*[;；,，]\s*", s):
            p = p.strip()
            if not p:
                continue
            ref_list.append(p)
            detail.append({"standard_id": p, "has_year": None, "full_text": None})
        return ref_list, detail
    if isinstance(refs_raw, list):
        for x in refs_raw:
            if isinstance(x, str) and x.strip():
                p = x.strip()
                ref_list.append(p)
                detail.append({"standard_id": p, "has_year": None, "full_text": None})
            elif isinstance(x, dict):
                sid = x.get("std_code") or x.get("standard_id") or x.get("code")
                if not sid:
                    continue
                sid_s = str(sid).strip()
                ref_list.append(sid_s)
                ft = x.get("full_text")
                detail.append(
                    {
                        "standard_id": sid_s,
                        "has_year": x.get("has_year"),
                        "full_text": None if ft is None else str(ft),
                    }
                )
        return ref_list, detail
    return [], []


def _map_qb_init_inner_to_workflow1_flat(inner: dict[str, Any]) -> dict[str, Any]:
    """将 QB_init_info 内层（或 outputs 根级扁平）对象转为与 DifyWorkflow1Output 同构的 dict。"""
    _raw_qb = inner.get("qb_id") if inner.get("qb_id") is not None else inner.get("qb_code")
    qb_code = ("" if _raw_qb is None else str(_raw_qb)).strip()
    indicators: list[dict[str, Any]] = []
    for row in inner.get("indexes") or []:
        if not isinstance(row, dict):
            continue
        idx_name = (row.get("index_name") or "").strip()
        key = (row.get("key") or "").strip()
        val = row.get("value")
        if idx_name and key:
            disp = f"{idx_name} / {key}"
        elif key:
            disp = key
        elif idx_name:
            disp = idx_name
        else:
            disp = "指标"
        indicators.append(
            {
                "name": disp,
                "value": "" if val is None else str(val),
                "raw": row,
            }
        )

    refs_raw = inner.get("referenced_std_codes")
    if refs_raw is None:
        refs_raw = inner.get("references")
    ref_list, references_detail = _normalize_workflow1_references(refs_raw)

    return {
        "qb_code": qb_code,
        "qb_name": inner.get("qb_name"),
        "company_name": inner.get("company_name"),
        "publish_date": inner.get("publish_date")
        or inner.get("impl_date")
        or inner.get("release_date")
        or inner.get("qibiao_release_date")
        or inner.get("enterprise_release_date"),
        "indicators": indicators,
        "referenced_std_codes": ref_list,
        "references_detail": references_detail,
    }


def extract_workflow1_output_dict(outputs: Any, *, wrapper_key: str | None = None) -> dict[str, Any]:
    """从 Dify `data.outputs` 提取与 `DifyWorkflow1Output` 同构的 dict（engine 内不做 Pydantic 校验）。"""
    if outputs is None:
        raise DifyApiError("Dify 返回 outputs 为 null")
    if isinstance(outputs, str):
        try:
            outputs = json.loads(outputs)
        except json.JSONDecodeError as e:
            raise DifyApiError(f"Dify outputs 为字符串但非合法 JSON: {e}") from e
    if not isinstance(outputs, dict):
        raise DifyApiError(f"Dify outputs 类型异常: {type(outputs)}")

    wk = (wrapper_key or os.environ.get("DIFY_WORKFLOW1_OUTPUT_WRAPPER_KEY") or "QB_init_info").strip()
    if wk in outputs:
        cell = outputs[wk]
        if isinstance(cell, str):
            inner = _parse_json_string_field(cell, wk)
        elif isinstance(cell, dict):
            inner = cell
        else:
            raise DifyApiError(f"{wk} 类型异常: {type(cell)}")
        flat = _map_qb_init_inner_to_workflow1_flat(inner)
        if not flat.get("qb_code"):
            raise DifyApiError(f"解析 {wk} 后 qb_id/qb_code 为空")
        return flat

    # 新版：整份 outputs 即企标对象（仅 qb_id、无 qb_code；references 为 {standard_id,...}[]）
    _top_qb = outputs.get("qb_id") if outputs.get("qb_id") is not None else outputs.get("qb_code")
    if _top_qb is not None and str(_top_qb).strip():
        flat_top = _map_qb_init_inner_to_workflow1_flat(outputs)
        if flat_top.get("qb_code"):
            return flat_top

    if "qb_code" in outputs:
        candidate = outputs
    elif isinstance(outputs.get("parse_result"), dict):
        candidate = outputs["parse_result"]
    elif isinstance(outputs.get("result"), dict):
        candidate = outputs["result"]
    elif isinstance(outputs.get("output"), dict):
        candidate = outputs["output"]
    else:
        candidate = None
        for v in outputs.values():
            if isinstance(v, dict) and ("qb_code" in v or "qb_id" in v):
                candidate = v
                break
        if candidate is None:
            for key in ("text", "result", "output", "answer"):
                raw = outputs.get(key)
                if isinstance(raw, str) and raw.strip().startswith("{"):
                    try:
                        candidate = json.loads(raw)
                        break
                    except json.JSONDecodeError:
                        continue
        if candidate is None:
            raise DifyApiError(
                "无法从 Dify outputs 解析企标结构：缺少 QB_init_info 或未识别的嵌套；"
                f"当前 keys={list(outputs.keys())}"
            )

    if isinstance(candidate, dict):
        _cq = candidate.get("qb_id") if candidate.get("qb_id") is not None else candidate.get("qb_code")
        if _cq is not None and str(_cq).strip():
            flat_c = _map_qb_init_inner_to_workflow1_flat(candidate)
            if flat_c.get("qb_code"):
                return flat_c

    return dict(candidate)


_VALID_FILE_PAYLOAD_MODES = frozenset({"inputs", "inputs_single", "files", "both"})


def _build_file_input_payload(
    input_key: str,
    file_cell: dict[str, Any],
    mode: str,
) -> tuple[dict[str, Any], list[dict[str, Any]] | None]:
    """构造工作流「单文件」类 inputs + 可选顶层 files。"""
    body_files: list[dict[str, Any]] | None = None
    if mode == "inputs":
        inputs: dict[str, Any] = {input_key: [file_cell]}
    elif mode == "inputs_single":
        inputs = {input_key: file_cell}
    elif mode == "files":
        inputs = {}
        body_files = [{"variable": input_key, **file_cell}]
    else:
        inputs = {input_key: file_cell}
        body_files = [{"variable": input_key, **file_cell}]
    return inputs, body_files


def _normalize_outputs(outputs: Any) -> dict[str, Any]:
    if outputs is None:
        raise DifyApiError("Dify 返回 outputs 为 null")
    if isinstance(outputs, str):
        try:
            outputs = json.loads(outputs)
        except json.JSONDecodeError as e:
            raise DifyApiError(f"Dify outputs 为字符串但非合法 JSON: {e}") from e
    if not isinstance(outputs, dict):
        raise DifyApiError(f"Dify outputs 类型异常: {type(outputs)}")
    return outputs


def _normalize_workflow2_index_item(item: Any) -> dict[str, Any] | None:
    """将 indexes 数组元素规范为 dict；不展开 index_content。"""
    if isinstance(item, dict):
        return item
    if isinstance(item, str) and item.strip():
        try:
            parsed = json.loads(item.strip())
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return parsed
    return None


def _extract_workflow2_indexes_list(
    outputs: Any,
    *,
    wrapper_key: str | None = None,
) -> list[dict[str, Any]]:
    """从工作流 ② outputs 提取 indexes 数组（每项含 index_name / index_type / index_content，整组落库）。"""
    out = _normalize_outputs(outputs)
    wk = (wrapper_key or os.environ.get("DIFY_WORKFLOW2_OUTPUT_WRAPPER_KEY") or "").strip()
    raw_items: list[Any] = []
    if wk and wk in out:
        cell = out[wk]
        if isinstance(cell, str):
            try:
                cell = json.loads(cell.strip())
            except json.JSONDecodeError:
                return []
        if isinstance(cell, list):
            raw_items = cell
        elif isinstance(cell, dict) and isinstance(cell.get("indexes"), list):
            raw_items = cell["indexes"]
        elif isinstance(cell, dict) and isinstance(cell.get("rows"), list):
            raw_items = cell["rows"]
        elif isinstance(cell, dict) and isinstance(cell.get("indicators"), list):
            raw_items = cell["indicators"]
        elif isinstance(cell, dict):
            raw_items = [cell]
    else:
        for key in ("indexes", "indicators", "rows", "lines", "data", "result", "output", "items"):
            v = out.get(key)
            if isinstance(v, list) and v:
                raw_items = v
                break
            if isinstance(v, str) and v.strip():
                try:
                    parsed = json.loads(v.strip())
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, list):
                    raw_items = parsed
                    break
                if isinstance(parsed, dict) and isinstance(parsed.get("indexes"), list):
                    raw_items = parsed["indexes"]
                    break
                if isinstance(parsed, dict) and isinstance(parsed.get("rows"), list):
                    raw_items = parsed["rows"]
                    break
        if not raw_items:
            for key in ("text", "answer", "output"):
                t = out.get(key)
                if not isinstance(t, str) or not t.strip():
                    continue
                try:
                    parsed = json.loads(t.strip())
                except json.JSONDecodeError:
                    break
                if isinstance(parsed, list):
                    raw_items = parsed
                    break
                if isinstance(parsed, dict) and isinstance(parsed.get("indexes"), list):
                    raw_items = parsed["indexes"]
                    break
                break

    indexes: list[dict[str, Any]] = []
    for item in raw_items:
        row = _normalize_workflow2_index_item(item)
        if row is not None:
            indexes.append(row)
    return indexes


def extract_workflow2_indexes_json(
    outputs: Any,
    *,
    wrapper_key: str | None = None,
) -> str | None:
    """将 indexes 数组序列化为一条 JSON 字符串，写入 national_standard_indicator.specific_indicator_value。"""
    indexes = _extract_workflow2_indexes_list(outputs, wrapper_key=wrapper_key)
    if not indexes:
        return None
    return json.dumps(indexes, ensure_ascii=False)


def extract_workflow2_indicator_lines(
    outputs: Any,
    *,
    wrapper_key: str | None = None,
) -> list[str]:
    """兼容旧调用：返回至多一条 JSON 数组字符串（整表 indexes 一行落库）。"""
    payload = extract_workflow2_indexes_json(outputs, wrapper_key=wrapper_key)
    return [payload] if payload else []


def extract_workflow3_compare_dict(outputs: Any, *, text_key: str | None = None) -> dict[str, Any]:
    """工作流 ③：对比结果多为 Markdown 表格；落 compare_result_json。"""
    out = _normalize_outputs(outputs)
    prefer = (text_key or os.environ.get("DIFY_WORKFLOW3_OUTPUT_TEXT_KEY") or "").strip()
    md_parts: list[str] = []
    if prefer and isinstance(out.get(prefer), str):
        md_parts.append(str(out[prefer]))
    for key in ("text", "answer", "output", "result", "compare_result", "markdown", "table"):
        v = out.get(key)
        if isinstance(v, str) and v.strip():
            md_parts.append(v.strip())
    if not md_parts:
        for _k, v in out.items():
            if isinstance(v, str) and "|" in v and "\n" in v:
                md_parts.append(v.strip())
                break
    markdown = "\n\n".join(md_parts) if md_parts else json.dumps(out, ensure_ascii=False)
    summary = ""
    for ln in markdown.splitlines():
        if ln.strip() and not ln.strip().startswith("|"):
            summary = ln.strip()[:500]
            break
    if not summary:
        summary = "指标对比完成（详见 markdown）"
    return {
        "summary": summary,
        "details": [],
        "markdown": markdown,
        "raw_output_keys": list(out.keys()),
    }


class DifyClient:
    def __init__(self) -> None:
        raw = (os.environ.get("DIFY_API_BASE") or "").strip().rstrip("/")
        self.api_base = raw
        self.api_key = (os.environ.get("DIFY_API_KEY") or "").strip()
        self.workflow_1_id = (os.environ.get("DIFY_WORKFLOW_1_ID") or "").strip()
        self.workflow1_files_input_key = (os.environ.get("DIFY_WORKFLOW1_FILES_INPUT_KEY") or "").strip()
        _mode = (os.environ.get("DIFY_WORKFLOW1_FILE_PAYLOAD_MODE") or "inputs_single").strip().lower()
        self.workflow1_file_payload_mode: str = _mode if _mode in _VALID_FILE_PAYLOAD_MODES else "inputs_single"
        self.workflow1_output_wrapper_key = (
            os.environ.get("DIFY_WORKFLOW1_OUTPUT_WRAPPER_KEY") or "QB_init_info"
        ).strip()
        self.workflow1_response_mode = (
            os.environ.get("DIFY_WORKFLOW1_RESPONSE_MODE", "blocking").strip().lower() or "blocking"
        )

        self.workflow_2_id = (os.environ.get("DIFY_WORKFLOW_2_ID") or "").strip()
        self.workflow2_api_key = (os.environ.get("DIFY_WORKFLOW2_API_KEY") or "").strip()
        self.workflow2_files_input_key = (os.environ.get("DIFY_WORKFLOW2_FILES_INPUT_KEY") or "file").strip()
        _m2 = (os.environ.get("DIFY_WORKFLOW2_FILE_PAYLOAD_MODE") or "").strip().lower()
        self.workflow2_file_payload_mode: str = (
            _m2 if _m2 in _VALID_FILE_PAYLOAD_MODES else self.workflow1_file_payload_mode
        )
        self.workflow2_output_wrapper_key = (os.environ.get("DIFY_WORKFLOW2_OUTPUT_WRAPPER_KEY") or "").strip()

        self.workflow_3_id = (os.environ.get("DIFY_WORKFLOW_3_ID") or "").strip()
        self.workflow3_api_key = (os.environ.get("DIFY_WORKFLOW3_API_KEY") or "").strip()
        self.workflow3_enterprise_input_key = (
            os.environ.get("DIFY_WORKFLOW3_ENTERPRISE_INPUT_KEY") or "enterprise_data"
        ).strip()
        self.workflow3_reference_input_key = (
            os.environ.get("DIFY_WORKFLOW3_REFERENCE_INPUT_KEY") or "reference_data"
        ).strip()
        self.workflow3_output_text_key = (os.environ.get("DIFY_WORKFLOW3_OUTPUT_TEXT_KEY") or "").strip()
        try:
            self.http_timeout = float(os.environ.get("DIFY_HTTP_TIMEOUT_SECONDS", "300") or "300")
        except ValueError:
            self.http_timeout = 300.0

        self.batch_normative_ref_api_base = (
            (os.environ.get("BATCH_NORMATIVE_REF_DIFY_API_BASE") or "").strip().rstrip("/")
        )
        self.batch_normative_ref_api_key = (os.environ.get("BATCH_NORMATIVE_REF_DIFY_API_KEY") or "").strip()
        self.batch_normative_ref_files_input_key = (
            (os.environ.get("BATCH_NORMATIVE_REF_FILES_INPUT_KEY") or "QB_file").strip()
        )
        _mbr = (os.environ.get("BATCH_NORMATIVE_REF_FILE_PAYLOAD_MODE") or "").strip().lower()
        self.batch_normative_ref_file_payload_mode: str = (
            _mbr if _mbr in _VALID_FILE_PAYLOAD_MODES else self.workflow1_file_payload_mode
        )
        self.batch_normative_ref_workflow_id = (os.environ.get("BATCH_NORMATIVE_REF_WORKFLOW_ID") or "").strip()

        # 国标指标入库工作流（STD_INDEX_DIFY_*）
        self.std_index_api_base = (os.environ.get("STD_INDEX_DIFY_API_BASE") or "").strip().rstrip("/")
        self.std_index_api_key = (os.environ.get("STD_INDEX_DIFY_API_KEY") or "").strip()
        self.std_index_files_input_key = (os.environ.get("STD_INDEX_DIFY_FILES_INPUT_KEY") or "file").strip()
        self.std_index_output_key = (os.environ.get("STD_INDEX_DIFY_OUTPUT_KEY") or "output").strip()
        _msi = (os.environ.get("STD_INDEX_DIFY_FILE_PAYLOAD_MODE") or "").strip().lower()
        self.std_index_file_payload_mode: str = (
            _msi if _msi in _VALID_FILE_PAYLOAD_MODES else self.workflow1_file_payload_mode
        )
        self.std_index_workflow_id = (os.environ.get("STD_INDEX_DIFY_WORKFLOW_ID") or "").strip()

    def effective_batch_normative_ref_api_base(self) -> str:
        return (self.batch_normative_ref_api_base or self.api_base).strip().rstrip("/")

    def is_batch_normative_ref_configured(self) -> bool:
        return bool(
            self.effective_batch_normative_ref_api_base()
            and self.batch_normative_ref_api_key
            and self.batch_normative_ref_files_input_key
        )

    def _headers(self, extra: dict[str, str] | None = None, *, api_key: str | None = None) -> dict[str, str]:
        key = (api_key if api_key is not None else self.api_key).strip()
        h = {"Authorization": f"Bearer {key}"}
        if extra:
            h.update(extra)
        return h

    def is_workflow1_configured(self) -> bool:
        return bool(self.api_base and self.api_key and self.workflow1_files_input_key)

    def assert_api_credentials(self) -> None:
        if not self.api_base or not self.api_key:
            raise RuntimeError("Dify 未配置：请设置 DIFY_API_BASE 与 DIFY_API_KEY")

    def assert_configured(self) -> None:
        """至少具备调用 Dify 的 API 根与密钥（工作流 ②③ 占位仍用此检查）。"""
        self.assert_api_credentials()

    def _assert_api_base(self) -> None:
        if not self.api_base:
            raise RuntimeError("Dify 未配置：请设置 DIFY_API_BASE")

    def is_workflow2_configured(self) -> bool:
        """工作流 ② 使用独立应用 API Key（DIFY_WORKFLOW2_API_KEY）。"""
        return bool(self.api_base and self.workflow2_api_key and self.workflow2_files_input_key)

    def is_workflow3_configured(self) -> bool:
        """工作流 ③ 使用独立应用 API Key（DIFY_WORKFLOW3_API_KEY）。"""
        return bool(self.api_base and self.workflow3_api_key)

    def _assert_workflow1_file_input(self) -> None:
        self.assert_api_credentials()
        if not self.workflow1_files_input_key:
            raise RuntimeError(
                "工作流 ① 未配置：请设置 DIFY_WORKFLOW1_FILES_INPUT_KEY（Dify 应用中文件列表变量的 variable）"
            )

    def upload_local_file(
        self,
        path: Path,
        user: str,
        *,
        api_key: str | None = None,
        api_base: str | None = None,
        upload_filename: str | None = None,
    ) -> dict[str, Any]:
        root = (api_base if api_base is not None else self.api_base).strip().rstrip("/")
        if not root:
            raise RuntimeError("Dify 未配置：请设置 DIFY_API_BASE，或 upload_local_file 传入 api_base=")
        key = (api_key if api_key is not None else self.api_key).strip()
        if not key:
            raise RuntimeError("Dify 文件上传缺少 API Key（可传 api_key= 或配置 DIFY_API_KEY）")
        url = f"{root}/files/upload"
        mime = _mime_for_compliance_document(path)
        name_for_upload = (upload_filename or "").strip() or path.name
        with path.open("rb") as f:
            files = {"file": (name_for_upload, f, mime)}
            data = {"user": user}
            try:
                r = httpx.post(
                    url, headers=self._headers(api_key=key), files=files, data=data, timeout=self.http_timeout
                )
            except httpx.RequestError as e:
                raise DifyApiError(f"Dify 文件上传网络错误: {e}") from e
        if r.status_code != 201:
            raise DifyApiError(
                f"Dify 文件上传失败 HTTP {r.status_code}",
                status_code=r.status_code,
                body=r.text[:2000],
            )
        return r.json()

    def _invoke_workflow_run_blocking(
        self,
        *,
        api_key: str,
        workflow_id: str | None,
        body: dict[str, Any],
        trace_id: str | None,
        err_label: str,
        api_base: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any], Any]:
        root = (api_base if api_base is not None else self.api_base).strip().rstrip("/")
        if not root:
            raise RuntimeError("Dify 未配置：请设置 DIFY_API_BASE，或调用处传入 api_base=")
        if workflow_id:
            run_url = f"{root}/workflows/{workflow_id}/run"
        else:
            run_url = f"{root}/workflows/run"
        hdr = self._headers({"X-Trace-Id": trace_id} if trace_id else None, api_key=api_key)
        try:
            r = httpx.post(run_url, headers=hdr, json=body, timeout=self.http_timeout)
        except httpx.RequestError as e:
            raise DifyApiError(f"Dify 工作流 {err_label} 请求失败: {e}") from e
        if r.status_code != 200:
            raise DifyApiError(
                f"Dify 工作流 {err_label} HTTP {r.status_code}",
                status_code=r.status_code,
                body=r.text[:8000],
            )
        payload = r.json()
        data = payload.get("data") or payload
        status = (data.get("status") or "").lower()
        outputs = data.get("outputs")
        err = data.get("error")
        meta: dict[str, Any] = {
            "workflow_run_id": payload.get("workflow_run_id") or data.get("id"),
            "dify_task_id": payload.get("task_id"),
            "workflow_id": data.get("workflow_id"),
            "status": status,
            "raw_outputs": outputs if isinstance(outputs, dict) else {"_non_dict": str(outputs)[:500]},
        }
        if status != "succeeded":
            raise DifyApiError(
                f"Dify 工作流 {err_label} 未成功: status={status}, error={err}",
                status_code=r.status_code,
                body=json.dumps(payload, ensure_ascii=False)[:4000],
            )
        _print_dify_workflow_response_to_terminal(err_label, payload)
        return payload, meta, outputs

    def run_workflow_1_parse_enterprise(
        self,
        local_file: Path,
        *,
        user: str,
        trace_id: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """
        上传本地企标文件并执行工作流 ①。

        Returns:
            (parse_result_json, meta) — meta 含 workflow_run_id、task_id、raw_outputs 等，写入任务 dify_run_metadata_json。
        """
        self._assert_workflow1_file_input()
        if self.workflow1_response_mode == "streaming":
            # 后续可解析 SSE；当前仍使用 blocking 请求体
            pass

        upload_json = self.upload_local_file(local_file, user)
        file_id = upload_json.get("id")
        if not file_id:
            raise DifyApiError(f"Dify 上传响应缺少 id: {upload_json}")

        key = self.workflow1_files_input_key
        file_cell: dict[str, Any] = {
            "transfer_method": "local_file",
            "upload_file_id": str(file_id),
            "type": "document",
        }

        inputs, body_files = _build_file_input_payload(key, file_cell, self.workflow1_file_payload_mode)
        body: dict[str, Any] = {
            "inputs": inputs,
            "response_mode": "blocking",
            "user": user,
        }
        if body_files is not None:
            body["files"] = body_files
        if trace_id:
            body["trace_id"] = trace_id

        payload, meta_run, outputs = self._invoke_workflow_run_blocking(
            api_key=self.api_key,
            workflow_id=self.workflow_1_id or None,
            body=body,
            trace_id=trace_id,
            err_label="①",
        )

        meta: dict[str, Any] = {
            **meta_run,
            "upload_file_id": str(file_id),
            "workflow1_file_payload_mode": self.workflow1_file_payload_mode,
        }

        raw = extract_workflow1_output_dict(outputs, wrapper_key=self.workflow1_output_wrapper_key)
        return raw, meta

    def run_batch_normative_ref_workflow(
        self,
        local_file: Path,
        *,
        user: str,
        trace_id: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """
        批量规范性引用评价专用 Dify：上传企标文件，输出与 workflow1 扁平结构兼容（可无 indicators）。

        使用 BATCH_NORMATIVE_REF_* 环境变量；Base 未单独配置时回退 DIFY_API_BASE。
        """
        base = self.effective_batch_normative_ref_api_base()
        if not base:
            raise RuntimeError("批量引用工作流未配置：请设置 BATCH_NORMATIVE_REF_DIFY_API_BASE 或 DIFY_API_BASE")
        if not self.batch_normative_ref_api_key:
            raise RuntimeError("批量引用工作流未配置：请设置 BATCH_NORMATIVE_REF_DIFY_API_KEY")
        if not self.batch_normative_ref_files_input_key:
            raise RuntimeError("批量引用工作流未配置：请设置 BATCH_NORMATIVE_REF_FILES_INPUT_KEY")

        upload_json = self.upload_local_file(
            local_file, user, api_key=self.batch_normative_ref_api_key, api_base=base
        )
        file_id = upload_json.get("id")
        if not file_id:
            raise DifyApiError(f"Dify 上传响应缺少 id: {upload_json}")

        key = self.batch_normative_ref_files_input_key
        file_cell: dict[str, Any] = {
            "transfer_method": "local_file",
            "upload_file_id": str(file_id),
            "type": "document",
        }

        inputs, body_files = _build_file_input_payload(key, file_cell, self.batch_normative_ref_file_payload_mode)
        body: dict[str, Any] = {
            "inputs": inputs,
            "response_mode": "blocking",
            "user": user,
        }
        if body_files is not None:
            body["files"] = body_files
        if trace_id:
            body["trace_id"] = trace_id

        payload, meta_run, outputs = self._invoke_workflow_run_blocking(
            api_key=self.batch_normative_ref_api_key,
            workflow_id=self.batch_normative_ref_workflow_id or None,
            body=body,
            trace_id=trace_id,
            err_label="batch-normative-ref",
            api_base=base,
        )

        meta: dict[str, Any] = {
            **meta_run,
            "upload_file_id": str(file_id),
            "batch_normative_ref_file_payload_mode": self.batch_normative_ref_file_payload_mode,
        }

        raw = extract_workflow1_output_dict(outputs, wrapper_key=self.workflow1_output_wrapper_key)
        return raw, meta

    def is_std_index_configured(self) -> bool:
        base = (self.std_index_api_base or self.api_base).strip().rstrip("/")
        return bool(base and self.std_index_api_key and self.std_index_files_input_key)

    def run_std_index_import_workflow(
        self,
        local_file: Path,
        *,
        user: str,
        trace_id: str | None = None,
        std_code_hint: str | None = None,
        original_filename: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """
        国标指标入库工作流：上传国标文件，输出含 bz_id + indexes 的结构化 JSON。

        输入变量：STD_INDEX_DIFY_FILES_INPUT_KEY（默认 file）
        输出变量：STD_INDEX_DIFY_OUTPUT_KEY（默认 output），值为 JSON 字符串或 dict。

        Returns:
            (result_dict, meta) — result_dict 含 bz_id / indexes 等字段。
        """
        base = (self.std_index_api_base or self.api_base).strip().rstrip("/")
        if not base:
            raise RuntimeError("国标指标工作流未配置：请设置 STD_INDEX_DIFY_API_BASE 或 DIFY_API_BASE")
        if not self.std_index_api_key:
            raise RuntimeError("国标指标工作流未配置：请设置 STD_INDEX_DIFY_API_KEY")
        if not self.std_index_files_input_key:
            raise RuntimeError("国标指标工作流未配置：请设置 STD_INDEX_DIFY_FILES_INPUT_KEY")

        upload_name = (original_filename or "").strip() or local_file.name
        upload_json = self.upload_local_file(
            local_file,
            user,
            api_key=self.std_index_api_key,
            api_base=base,
            upload_filename=upload_name,
        )
        file_id = upload_json.get("id")
        if not file_id:
            raise DifyApiError(f"Dify 文件上传响应缺少 id: {upload_json}")

        file_cell: dict[str, Any] = {
            "transfer_method": "local_file",
            "upload_file_id": str(file_id),
            "type": "document",
        }
        inputs, body_files = _build_file_input_payload(
            self.std_index_files_input_key, file_cell, self.std_index_file_payload_mode
        )
        hint_key = (os.environ.get("STD_INDEX_DIFY_STD_CODE_HINT_KEY") or "").strip()
        fn_key = (os.environ.get("STD_INDEX_DIFY_FILENAME_HINT_KEY") or "").strip()
        if hint_key and (std_code_hint or "").strip():
            inputs[hint_key] = (std_code_hint or "").strip()
        if fn_key and (original_filename or "").strip():
            inputs[fn_key] = (original_filename or "").strip()
        body: dict[str, Any] = {"inputs": inputs, "response_mode": "blocking", "user": user}
        if body_files is not None:
            body["files"] = body_files
        if trace_id:
            body["trace_id"] = trace_id

        _payload, meta_run, outputs = self._invoke_workflow_run_blocking(
            api_key=self.std_index_api_key,
            workflow_id=self.std_index_workflow_id or None,
            body=body,
            trace_id=trace_id,
            err_label="std-index",
            api_base=base,
        )

        # 从 outputs 取出目标 key（默认 output），尝试 JSON 解析
        out = _normalize_outputs(outputs)
        raw_cell = out.get(self.std_index_output_key)
        if raw_cell is None:
            # 尝试任意第一个 dict/str 字段
            for v in out.values():
                if v is not None:
                    raw_cell = v
                    break
        if isinstance(raw_cell, str):
            try:
                raw_cell = json.loads(raw_cell.strip())
            except json.JSONDecodeError:
                raise DifyApiError(
                    f"国标指标工作流 output 字段无法解析为 JSON: {raw_cell[:500]}"
                )
        if not isinstance(raw_cell, dict):
            raise DifyApiError(
                f"国标指标工作流 output 预期为 JSON 对象，实际: {type(raw_cell).__name__}"
            )

        meta: dict[str, Any] = {
            **meta_run,
            "upload_file_id": str(file_id),
            "std_index_output_key": self.std_index_output_key,
        }
        return raw_cell, meta

    def run_workflow_2_national_standard_indicators(
        self,
        local_file: Path,
        *,
        user: str,
        std_code: str,
        trace_id: str | None = None,
    ) -> tuple[list[str], dict[str, Any]]:
        """
        工作流 ②：上传国标本地文件并解析为指标行（写入库由调用方负责）。

        Returns:
            (lines, meta) — lines 至多 1 项：indexes 整数组 JSON，写入一条 national_standard_indicator 记录。
        """
        self._assert_api_base()
        if not self.workflow2_api_key:
            raise RuntimeError("工作流 ② 未配置：请设置 DIFY_WORKFLOW2_API_KEY")
        if not self.workflow2_files_input_key:
            raise RuntimeError("工作流 ② 未配置：请设置 DIFY_WORKFLOW2_FILES_INPUT_KEY（开始节点文件变量名，默认 file）")

        upload_json = self.upload_local_file(local_file, user, api_key=self.workflow2_api_key)
        file_id = upload_json.get("id")
        if not file_id:
            raise DifyApiError(f"Dify ② 上传响应缺少 id: {upload_json}")

        key = self.workflow2_files_input_key
        file_cell: dict[str, Any] = {
            "transfer_method": "local_file",
            "upload_file_id": str(file_id),
            "type": "document",
        }
        inputs, body_files = _build_file_input_payload(key, file_cell, self.workflow2_file_payload_mode)
        body: dict[str, Any] = {
            "inputs": inputs,
            "response_mode": "blocking",
            "user": user,
        }
        if body_files is not None:
            body["files"] = body_files
        if trace_id:
            body["trace_id"] = trace_id

        _payload, meta_run, outputs = self._invoke_workflow_run_blocking(
            api_key=self.workflow2_api_key,
            workflow_id=self.workflow_2_id or None,
            body=body,
            trace_id=trace_id,
            err_label="②",
        )
        lines = extract_workflow2_indicator_lines(
            outputs,
            wrapper_key=self.workflow2_output_wrapper_key or None,
        )
        if not lines:
            raise DifyApiError(
                "工作流 ② outputs 未解析出 indexes 数组；请配置 DIFY_WORKFLOW2_OUTPUT_WRAPPER_KEY 或调整 Dify 输出为 indexes JSON 数组",
                body=json.dumps(outputs if isinstance(outputs, dict) else {}, ensure_ascii=False)[:2000],
            )
        meta: dict[str, Any] = {
            **meta_run,
            "std_code": std_code,
            "upload_file_id": str(file_id),
            "workflow2_file_payload_mode": self.workflow2_file_payload_mode,
            "indexes_count": len(json.loads(lines[0])),
        }
        return lines, meta

    def run_workflow_3_index_compare(
        self,
        *,
        enterprise_data: str,
        reference_data: str,
        user: str,
        trace_id: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """工作流 ③：企标侧与国标侧结构化 JSON 字符串对比；返回落 compare_result_json 的 dict。"""
        self._assert_api_base()
        if not self.workflow3_api_key:
            raise RuntimeError("工作流 ③ 未配置：请设置 DIFY_WORKFLOW3_API_KEY")

        body: dict[str, Any] = {
            "inputs": {
                self.workflow3_enterprise_input_key: enterprise_data,
                self.workflow3_reference_input_key: reference_data,
            },
            "response_mode": "blocking",
            "user": user,
        }
        if trace_id:
            body["trace_id"] = trace_id

        _payload, meta_run, outputs = self._invoke_workflow_run_blocking(
            api_key=self.workflow3_api_key,
            workflow_id=self.workflow_3_id or None,
            body=body,
            trace_id=trace_id,
            err_label="③",
        )
        cmp_dict = extract_workflow3_compare_dict(
            outputs,
            text_key=self.workflow3_output_text_key or None,
        )
        meta: dict[str, Any] = {
            **meta_run,
            "workflow3_enterprise_key": self.workflow3_enterprise_input_key,
            "workflow3_reference_key": self.workflow3_reference_input_key,
        }
        return cmp_dict, meta
