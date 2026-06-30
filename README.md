# 交易复盘

本地优先的交易复盘工具，用于记录交易订单、截图、情绪状态、执行评分，并做基础 R 倍数统计。

## 功能

- 记录、编辑、删除、复制交易
- 上传并压缩交易截图，保存到浏览器 IndexedDB
- 统计总 R、胜率、系统内/外表现、策略、时段、情绪评分和偏执类型
- 日历看板按月查看每天交易笔数、总 R、实际盈亏和风险信号
- 完整 JSON、轻量 JSON、CSV、Markdown 导出和 JSON 导入

## 本地运行

```bash
npm install
npm run dev
```

本地预览地址：

```text
http://127.0.0.1:5173/trading-journal/
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。

## GitHub Pages

项目已配置 Vite base：

```ts
base: "/trading-journal/"
```

当前发布方式使用 `gh-pages` 分支保存 `dist/` 静态产物，访问地址：

```text
https://slimmmmmmmy.github.io/trading-journal/
```

所有交易数据默认保存在当前浏览器的 IndexedDB，不会上传到服务器。手机和电脑的数据互不自动同步，需要通过完整 JSON 备份导出/导入迁移。
