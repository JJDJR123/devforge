/**
 * 前台功能开关。
 * 成员素材库暂时关闭：后端接口和 MemberAssetsView 保留，不显示入口和路由。
 * 需要恢复时改成 true。
 */
export const FEATURES = {
  memberAssets: false,
} as const;
