"""`whale-tutor doctor` — 健康检查:node 版本 / mysql 连通 / API key 设了没。"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from rich.console import Console
from rich.table import Table

from .config import WhaleTutorConfig
from .db import ping as db_ping

console = Console()


def check_node() -> tuple[bool, str]:
    node = shutil.which("node")
    if not node:
        return False, "未找到 node 可执行文件"
    try:
        result = subprocess.run(
            [node, "--version"], capture_output=True, text=True, timeout=5
        )
        version = result.stdout.strip().lstrip("v")
        major = int(version.split(".")[0])
        if major < 22:
            return False, f"node 版本 {version} 太低,需要 ≥ 22"
        return True, f"v{version}"
    except (subprocess.TimeoutExpired, ValueError, IndexError) as e:
        return False, f"无法解析 node 版本:{e}"


def check_mysql(cfg: WhaleTutorConfig) -> tuple[bool, str]:
    ok, err = db_ping(cfg)
    if ok:
        return True, f"{cfg.database.user}@{cfg.database.host}:{cfg.database.port}/{cfg.database.database}"
    return False, err


def check_api_key(cfg: WhaleTutorConfig) -> tuple[bool, str]:
    key = cfg.ai.deepseek_api_key
    if not key:
        return False, "DEEPSEEK_API_KEY 未设(AI 调用会走 fallback 文案)"
    if not key.startswith("sk-"):
        return False, f"API key 格式异常(不是 sk- 开头):{key[:10]}…"
    return True, f"已设({key[:8]}…,长度 {len(key)})"


def check_bundle(bundle_root: Path) -> tuple[bool, str]:
    server_main = bundle_root / "server" / "dist" / "main.js"
    web_index = bundle_root / "web" / "index.html"
    schema = bundle_root / "db" / "init" / "01-schema.sql"
    missing = [
        str(p.relative_to(bundle_root))
        for p in (server_main, web_index, schema)
        if not p.exists()
    ]
    if missing:
        return False, f"bundle 资源缺失:{', '.join(missing)}"
    return True, "server / web / schema 都在"


def run_doctor(cfg: WhaleTutorConfig, bundle_root: Path) -> None:
    table = Table(title="Whale Tutor Health Check", show_header=True)
    table.add_column("检查项", style="cyan")
    table.add_column("状态", justify="center")
    table.add_column("详情")

    checks = [
        ("Node.js", check_node()),
        ("Bundle 资源", check_bundle(bundle_root)),
        ("MySQL 连接", check_mysql(cfg)),
        ("DeepSeek API key", check_api_key(cfg)),
    ]

    all_ok = True
    for name, (ok, detail) in checks:
        if ok:
            table.add_row(name, "[green]✓[/green]", detail)
        else:
            table.add_row(name, "[red]✗[/red]", detail)
            # API key 不设不算致命(可走 fallback)
            if name != "DeepSeek API key":
                all_ok = False

    console.print(table)
    if all_ok:
        console.print("\n[green bold]全部就绪,可以 `whale-tutor start` 了。[/green bold]")
    else:
        console.print(
            "\n[yellow bold]有项目不通过。修复后再试 `whale-tutor start`。[/yellow bold]"
        )
