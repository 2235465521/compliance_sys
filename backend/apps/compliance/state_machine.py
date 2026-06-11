"""合规模块 — 纯状态转移规则（不依赖 ORM，便于单测）。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ConfirmEvent = Literal[
    "confirm_step1",
    "confirm_step2",
    "confirm_step3",
    "confirm_step4",
    "confirm_step5",
]


@dataclass(frozen=True)
class TaskStateView:
    current_step: int
    step4_indicators_confirmed: bool
    step5_compare_confirmed: bool
    has_parse_result: bool
    parse_status: str = "completed"
    parse_error: str | None = None


def assert_upload_allowed(view: TaskStateView) -> None:
    if view.current_step != 1:
        raise ValueError("仅步骤 1 允许上传或替换企标文件")
    if view.parse_status in ("pending", "running"):
        raise ValueError("企标解析进行中，请稍后再上传或刷新任务状态后再试")


def assert_confirm_step1(view: TaskStateView) -> None:
    if view.current_step != 1:
        raise ValueError("当前不在步骤 1，无法提交审核 1")
    if view.parse_status in ("pending", "running"):
        raise ValueError("企标解析进行中，请稍后刷新任务状态再提交审核 1")
    if view.parse_status == "failed":
        err = (view.parse_error or "").strip()
        hint = f"：{err}" if err else ""
        raise ValueError(f"企标解析失败，请重新上传企标文件{hint}")
    if not view.has_parse_result:
        raise ValueError("请先上传并完成解析（或 Mock 解析）后再提交审核 1")


def assert_confirm_step2(view: TaskStateView) -> None:
    if view.current_step != 2:
        raise ValueError("当前不在步骤 2，无法提交审核 2")


def assert_confirm_step3(view: TaskStateView) -> None:
    if view.current_step < 3:
        raise ValueError("尚未到达步骤 3，无法提交审核 3")


def assert_confirm_step4(view: TaskStateView) -> None:
    if view.current_step < 4:
        raise ValueError("尚未到达步骤 4，无法提交审核 4")


def assert_confirm_step5(view: TaskStateView) -> None:
    if view.current_step != 5:
        raise ValueError("当前不在步骤 5，无法提交审核 5")
    if not view.step4_indicators_confirmed:
        raise ValueError("须先通过审核 4")
    if view.step5_compare_confirmed:
        raise ValueError("审核 5 已确认，勿重复提交")


def next_step_after_confirm(event: ConfirmEvent) -> int:
    return {
        "confirm_step1": 2,
        "confirm_step2": 3,
        "confirm_step3": 4,
        "confirm_step4": 5,
        "confirm_step5": 6,
    }[event]
