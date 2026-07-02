# Repeating Interval Alarm

一个可配置的循环闹钟网页应用，支持固定间隔响铃、固定响铃时长、指定重复次数和无限循环。

## 功能

- 设置间隔时间（分钟）、响铃时长和重复次数
- 支持无限循环
- 手动开始和停止
- 当前状态、剩余次数、下一次倒计时展示
- 自动清理计时器，避免重复触发
- 核心逻辑带自动化测试

## 本地运行

```bash
npm start
```

然后打开：

```txt
http://localhost:5173
```

## 测试

```bash
npm test
```

## GitHub Pages 部署

项目是静态网页，不需要构建步骤。推送到 GitHub 后，可以使用仓库内的 GitHub Actions workflow 自动部署到 GitHub Pages。

部署前需要在 GitHub 仓库中确认：

1. Settings -> Pages
2. Source 选择 GitHub Actions
3. 推送到 `main` 分支

## 项目结构

```txt
index.html
src/
  app.js
  repeatingAlarm.js
  styles.css
test/
  repeatingAlarm.test.js
outputs/
  repeating-interval-alarm-prd.md
```
