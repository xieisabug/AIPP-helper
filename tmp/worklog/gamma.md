# Gamma MCP

应用目录、创作分类及中英文详情已接入 Gamma。图标来自 https://static.gamma.app/favicons/favicon_dark.svg 。

实测公开 OAuth 元数据支持公共客户端和 S256。以 AIPP 桌面回调 http://127.0.0.1:49152/oauth/callback 注册，返回 HTTP 400 invalid_redirect_uri。待 Gamma 登记回调后验证登录、图片与文件导出。
目录和插件接口测试 12/12 通过。TypeScript 与 Worker/前端生产构建通过。
