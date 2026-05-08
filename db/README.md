# db

MySQL 数据存放与初始化脚本。

- `init/*.sql` 会在 MySQL 容器**首次启动**（卷为空）时按文件名顺序自动执行，用于建表、灌入种子数据等。
- 容器数据持久化到 docker volume `whale-tutor-mysql-data`（见根目录 `docker-compose.yml`）。
- 后续要改 schema 时，修改对应 SQL 后需要 `docker compose down -v` 清空 volume，或者手动连库执行。
