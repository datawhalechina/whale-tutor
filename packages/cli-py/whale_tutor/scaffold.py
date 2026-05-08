"""`whale-tutor init` — 在当前目录 scaffold 完整示例课程 + 配置文件模板。"""

from __future__ import annotations

import shutil
from pathlib import Path

from rich.console import Console

from .config import CONFIG_FILENAME

console = Console()

CONFIG_TEMPLATE = """\
# Whale Tutor 配置文件
# 参考:https://github.com/datawhale/whale-tutor

# 课程内容根目录(相对此配置文件所在位置)
# 该目录下每个含 course.yaml 的子目录都被视为一门课程,自动加载。
courses_dir: ./courses

# MySQL 连接 — 课程作者本机已开 MySQL
# (server 启动时若发现 schema 缺失会自动应用 db/init/01-schema.sql)
database:
  host: localhost
  port: 13306
  user: tutor
  password: tutor
  database: whale_tutor

# AI Gateway — DeepSeek (OpenAI 兼容协议)
# 留空则所有 AI 调用走 fallback 文案,不影响 e2e 但章末测试无法通过
ai:
  deepseek_api_key: ""
  deepseek_api_base_url: https://api.deepseek.com

# server 端口
server:
  port: 3000
"""


def scaffold_init(template_name: str, target_dir: Path) -> None:
    """把 _bundle/templates/<template_name>/ 复制到 target_dir/courses/<template_name>/,
    并在 target_dir 写一份 whale-tutor.config.yaml 模板。

    target_dir 通常是 cwd。复制失败(目标已存在)时给清晰错误。
    """
    from importlib.resources import files

    bundle = files("whale_tutor").joinpath("_bundle")
    template_src = bundle.joinpath("templates", template_name)

    # importlib.resources 的对象不一定是真实文件路径(zip wheel 场景)
    # 转成 Path 在 wheel 安装的场景下应该 OK(hatchling 不压缩 wheel 资源)
    template_path = Path(str(template_src))
    if not template_path.exists():
        console.print(
            f"[red]✗ 找不到模板 {template_name}(查找路径 {template_path})。"
            "可能 pip 包损坏,试试重装。[/red]"
        )
        raise FileNotFoundError(template_path)

    courses_dir = target_dir / "courses"
    target_course = courses_dir / template_name

    if target_course.exists():
        console.print(
            f"[yellow]⚠ 目标目录已存在 {target_course},跳过课程内容复制[/yellow]"
        )
    else:
        courses_dir.mkdir(parents=True, exist_ok=True)
        shutil.copytree(template_path, target_course)
        console.print(f"[green]✓ 已生成示例课程 → {target_course}[/green]")

    # 配置文件
    config_target = target_dir / CONFIG_FILENAME
    if config_target.exists():
        console.print(
            f"[yellow]⚠ {CONFIG_FILENAME} 已存在,跳过(若想重置请手动删除)[/yellow]"
        )
    else:
        config_target.write_text(CONFIG_TEMPLATE, encoding="utf-8")
        console.print(f"[green]✓ 已生成配置文件 → {config_target}[/green]")

    console.print()
    console.print("[bold]下一步:[/bold]")
    console.print(
        f"  1. 编辑 [cyan]{CONFIG_FILENAME}[/cyan] 填入你的 mysql 连接 + DEEPSEEK_API_KEY"
    )
    console.print(
        f"  2. 编辑 [cyan]courses/{template_name}/[/cyan] 下的 yaml/md 修改课程内容"
    )
    console.print(
        "  3. 运行 [bold]whale-tutor start[/bold] 启动学习环境"
    )
