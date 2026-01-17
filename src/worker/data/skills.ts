export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  download_url: string;
  source_url: string;
}

export const skills: Skill[] = [
  {
    id: "aipp-database",
    name: "AIPP Database",
    description: "读取和操作 AIPP 数据库的能力",
    version: "1.0.0",
    download_url: "https://aipp-skills.xiejingyang.com/AIPP-database.zip",
    source_url: "https://github.com/xieisabug/AIPP"
  },
  {
    id: "doc-generator",
    name: "Document Generator",
    description: "自动从代码生成文档",
    version: "2.1.0",
    download_url: "https://example.com/download/doc-generator",
    source_url: "https://github.com/example/doc-generator"
  },
  {
    id: "api-tester",
    name: "API Tester",
    description: "测试和调试 API 端点的工具",
    version: "1.5.2",
    download_url: "https://example.com/download/api-tester",
    source_url: "https://github.com/example/api-tester"
  },
  {
    id: "log-parser",
    name: "Log Parser",
    description: "解析和分析应用日志",
    version: "0.9.0",
    download_url: "https://example.com/download/log-parser",
    source_url: "https://github.com/example/log-parser"
  },
  {
    id: "config-manager",
    name: "Config Manager",
    description: "管理应用配置文件",
    version: "1.2.5",
    download_url: "https://example.com/download/config-manager",
    source_url: "https://github.com/example/config-manager"
  }
];
