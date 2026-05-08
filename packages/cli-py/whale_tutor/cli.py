"""click 入口。命令:init / start / doctor。"""

from __future__ import annotations

import sys
from pathlib import Path

import click
from rich.console import Console

from . import __version__
from .config import find_config, load_config
from .db import ensure_schema
from .doctor import run_doctor
from .runner import start_node_server
from .scaffold import scaffold_init

console = Console()


def _bundle_root() -> Path:
    """返回 wheel 安装后 _bundle/ 目录的绝对路径。"""
    from importlib.resources import files

    bundle = files("whale_tutor").joinpath("_bundle")
    return Path(str(bundle))


def _schema_file(bundle_root: Path) -> Path:
    return bundle_root / "db" / "init" / "01-schema.sql"


@click.group()
@click.version_option(__version__, prog_name="whale-tutor")
def main() -> None:
    """Whale Tutor — AI-driven interactive Python tutor.

    课程作者用的命令行:在自己的目录写 yaml/md 内容,一键启动学习环境。
    """


@main.command()
@click.option(
    "--template",
    default="python-basics",
    show_default=True,
    help="scaffold 模板名(对应 _bundle/templates/<template>/)",
)
@click.option(
    "--target",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help="目标目录,默认当前目录",
)
def init(template: str, target: Path | None) -> None:
    """在当前目录 scaffold 完整示例课程 + 配置文件模板。"""
    target_dir = (target or Path.cwd()).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)
    scaffold_init(template, target_dir)


@main.command()
@click.option(
    "--no-open",
    "no_open",
    is_flag=True,
    default=False,
    help="server 就绪后不自动打开浏览器(远程开发 / 手工调试时用)。",
)
def start(no_open: bool) -> None:
    """启动 server(自动应用 schema + serve API + serve web)。"""
    try:
        config_path = find_config()
    except FileNotFoundError as e:
        console.print(f"[red]✗ {e}[/red]")
        sys.exit(1)

    console.print(f"[dim]使用配置 {config_path}[/dim]")
    cfg = load_config(config_path)
    bundle_root = _bundle_root()
    schema_file = _schema_file(bundle_root)

    # 应用 schema(如缺失)
    try:
        ensure_schema(cfg, schema_file)
    except Exception as e:  # noqa: BLE001 — 给用户看错误
        console.print(f"[red]✗ 连不上 mysql 或 schema 应用失败:{e}[/red]")
        console.print(
            "[yellow]提示:确认配置文件里的 database 字段正确,且 mysql 在监听该端口。[/yellow]"
        )
        sys.exit(1)

    # 前台启动 node server
    exit_code = start_node_server(cfg, bundle_root, open_browser=not no_open)
    sys.exit(exit_code)


@main.command()
def doctor() -> None:
    """健康检查:node 版本 / bundle 资源 / mysql 连通 / API key。"""
    try:
        config_path = find_config()
    except FileNotFoundError as e:
        console.print(f"[red]✗ {e}[/red]")
        sys.exit(1)

    cfg = load_config(config_path)
    bundle_root = _bundle_root()
    run_doctor(cfg, bundle_root)


if __name__ == "__main__":
    main()
