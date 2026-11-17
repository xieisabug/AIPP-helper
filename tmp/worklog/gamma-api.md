按照 Gamma 官方索引和各接口 OpenAPI 描述发布独立的 API Key 连接，包含 26 项、创建 Key 链接、二进制上传、删除和归档。模拟测试使用独立的工具请求与 HTTP 预期，不使用真实 Key 或工作区。
helper 的 13 项测试通过。AIPP 本机模拟 HTTP 服务已覆盖官方 26 项接口，验证图片、PPTX 和 PDF 的任务 ID 与文件结果、上传原始字节、删除成功与权限错误。
下架旧版 Gamma OAuth 目录条目与工具摘要，保留 gamma-api 的 26 项接口。
