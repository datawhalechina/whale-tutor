"""MySQL 连接 + schema 探测/应用。CLI 在启动 node 之前 idempotently 应用 schema。"""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

import mysql.connector
from mysql.connector.errors import Error as MysqlError
from rich.console import Console

from .config import WhaleTutorConfig

console = Console()


def ping(cfg: WhaleTutorConfig) -> Tuple[bool, str]:
    """测试 mysql 连通性。返回 (成功, 错误消息)。"""
    try:
        conn = mysql.connector.connect(
            host=cfg.database.host,
            port=cfg.database.port,
            user=cfg.database.user,
            password=cfg.database.password,
            database=cfg.database.database,
            connection_timeout=5,
        )
        conn.close()
        return True, ""
    except MysqlError as e:
        return False, str(e)


def has_schema(cfg: WhaleTutorConfig) -> bool:
    """检测 events 表(核心事实表)是否存在。"""
    conn = mysql.connector.connect(
        host=cfg.database.host,
        port=cfg.database.port,
        user=cfg.database.user,
        password=cfg.database.password,
        database=cfg.database.database,
    )
    try:
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES LIKE 'events'")
        rows = cursor.fetchall()
        return len(rows) > 0
    finally:
        conn.close()


def apply_schema(cfg: WhaleTutorConfig, schema_file: Path) -> None:
    """运行 schema_file 中的 SQL。idempotent — 调用方应先 has_schema 检查。

    schema 文件含多条 CREATE TABLE 用 ; 分割;mysql-connector multi=True 一次性执行。
    """
    sql = schema_file.read_text(encoding="utf-8")
    conn = mysql.connector.connect(
        host=cfg.database.host,
        port=cfg.database.port,
        user=cfg.database.user,
        password=cfg.database.password,
        database=cfg.database.database,
    )
    try:
        cursor = conn.cursor()
        # multi=True 让一次 execute 处理多条以 ; 分割的语句
        for _ in cursor.execute(sql, multi=True):
            pass
        conn.commit()
    finally:
        conn.close()


def ensure_schema(cfg: WhaleTutorConfig, schema_file: Path) -> None:
    """检测 + 应用 schema(如缺失)。CLI start 命令前调用。"""
    if has_schema(cfg):
        console.print("[dim]✓ schema 已就绪,跳过初始化[/dim]")
        return
    console.print(f"[yellow]→ 检测到 mysql 中缺少 schema,正在应用 {schema_file.name}…[/yellow]")
    apply_schema(cfg, schema_file)
    console.print("[green]✓ schema 已应用[/green]")
