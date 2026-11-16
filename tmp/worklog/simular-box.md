# Simular Box 接入
在 AIPP-helper 应用目录添加 Simular Box，配置远端 HTTP MCP、OAuth 作用域 boxes/connect，关联固定到 2500c46 的官方 box Skill。应用详情包括中英文工具摘要。
已读取服务的 401 challenge、protected resource、授权服务器元数据及固定提交的 SKILL.md。AIPP 现有连接及技能安装流程可复用。
helper 两组测试共 11 项通过，生产构建通过。尚未部署或用真实账号验证授权和云电脑操作。
改为发布 Simular 的官方 openai 插件包 1.0.1。两项 Skill 随插件安装和卸载，官方 PNG 随 helper 发布。AIPP 归档校验、实际安装及读取两项 Skill 的定向测试通过。
