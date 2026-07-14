# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 的基本格式；版本以 Git tag（Git 标签）为准。

## [Unreleased]

### Changed

- 选项 ID 改为从 `1` 开始、按展示顺序连续递增的用户可见序号；终端界面在每个选项前显示该序号，便于在“其他”答案中按编号指代选项。

## [0.0.1] - 2026-07-14

### Added

- 提供 `dask` 结构化提问工具，支持单选、复选、其他输入、回退、摘要确认和取消。
- 提供请求校验、接口契约和确定性测试。
