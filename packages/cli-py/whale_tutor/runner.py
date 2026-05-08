"""subprocess 启动 node server,信号转发(Ctrl+C 优雅退出)。"""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

from rich.console import Console

from .config import WhaleTutorConfig, to_env

console = Console()


def find_node() -> str:
    """找系统中的 node。找不到给清晰的错误提示。"""
    node = shutil.which("node")
    if not node:
        console.print(
            "[red]✗ 未找到 node。Whale Tutor 需要 Node.js ≥ 22。"
            "请装 https://nodejs.org/ 后重试。[/red]"
        )
        sys.exit(1)
    return node


def _wait_and_open_browser(port: int, timeout_s: float = 30.0) -> None:
    """轮询 :port 直到能 connect 上,然后开浏览器。在线程里跑。"""
    deadline = time.time() + timeout_s
    url = f"http://localhost:{port}"
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                # 给 nest 的 router 再一点点时间(server listen != routes ready)
                time.sleep(0.3)
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.3)
    # 超时不报错 — server 可能有别的问题,日志会显示


def start_node_server(
    cfg: WhaleTutorConfig, bundle_root: Path, *, open_browser: bool = True
) -> int:
    """启动 node server,前台运行直到 server 退出或用户 Ctrl+C。

    返回 node 进程退出码。open_browser=True 时 server ready 后自动开默认浏览器。
    """
    node = find_node()
    server_main = bundle_root / "server" / "dist" / "main.js"
    web_dir = bundle_root / "web"
    schema_file = bundle_root / "db" / "init" / "01-schema.sql"

    if not server_main.exists():
        console.print(
            f"[red]✗ 找不到 server bundle ({server_main})。"
            "可能是 pip 包损坏,试试重装 whale-tutor。[/red]"
        )
        sys.exit(1)

    env = os.environ.copy()
    env.update(to_env(cfg, web_dir=web_dir, schema_file=schema_file))

    console.print(
        f"[bold green]→ 启动 server[/bold green] [dim]node {server_main.name}[/dim]"
    )
    console.print(f"[dim]  courses: {cfg.courses_dir}[/dim]")
    console.print(f"[dim]  port: {cfg.server.port}[/dim]")
    console.print(
        f"[dim]  db: {cfg.database.user}@{cfg.database.host}:"
        f"{cfg.database.port}/{cfg.database.database}[/dim]"
    )
    console.print(
        f"[bold]  → 浏览器打开 http://localhost:{cfg.server.port}[/bold]\n"
    )

    # 用 Popen 而非 run,这样可以在主进程接 SIGINT 后转发给 child
    # cwd 设为 server bundle 内,让 nest-cli.json 等相对路径生效
    proc = subprocess.Popen(
        [node, str(server_main)],
        env=env,
        cwd=str(server_main.parent),
    )

    if open_browser:
        threading.Thread(
            target=_wait_and_open_browser,
            args=(cfg.server.port,),
            daemon=True,
        ).start()

    def forward_signal(signum, _frame):  # noqa: ANN001
        # 让 node 收到信号,优雅退出
        try:
            proc.send_signal(signum)
        except ProcessLookupError:
            pass

    # SIGINT (Ctrl+C) 在 Windows 上语义不同,但 Popen.send_signal 会用平台原生方式
    signal.signal(signal.SIGINT, forward_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, forward_signal)

    try:
        return proc.wait()
    except KeyboardInterrupt:
        # 兜底:Python KeyboardInterrupt
        try:
            proc.terminate()
            return proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            return proc.wait()
