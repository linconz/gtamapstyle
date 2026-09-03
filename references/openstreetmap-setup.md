# OpenFreeMap 与 OpenStreetMap 环境

## 必需条件

- Node.js 20 或更高版本。
- 本机安装 Google Chrome。
- 能访问 OpenFreeMap、Nominatim 和 Overpass API。

城市解析与地点查询来自 OpenStreetMap 的公共服务。

## 公共服务约束

- Nominatim 将规范化城市和范围结果缓存 30 天；脚本按公共服务要求限制为每秒不超过一次请求。
- Overpass 将所有地点类别合并查询；环路范围需要先执行一次独立的边界查询。请求不会并发发送。
- 公共服务没有可用性承诺。若服务繁忙，稍后重试，或通过 `OSM_NOMINATIM_URL`、`OSM_OVERPASS_URL` 指向自建兼容实例。
- 脚本不保存 Overpass 原始响应、地点名称或中间地点清单。

## 底部提示

本项目的导出页面禁用地图控件，并在四周各裁切 128 像素；最终 PNG 不保留右下角底部提示。
