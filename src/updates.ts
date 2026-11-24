export type UpdateAudience = 'all' | 'members' | 'admin';

export type UpdateEntry = {
  id: string;
  date: string;
  title: string;
  audience: UpdateAudience;
  items: Array<{ title: string; body: string }>;
};

export const UPDATES: UpdateEntry[] = [
  {
    id: '2026-11-25-members',
    date: '2026-11-25',
    title: '成员空间与好友系统',
    audience: 'members',
    items: [
      { title: '左侧成员导航', body: '知识库、素材库、聊天室、信箱和好友统一放到左侧，和公开页面分开。' },
      { title: '好友与私聊', body: '可以搜索成员、发送好友申请、设置只有自己可见的好友备注，并进行一对一私聊。' },
      { title: '图片私聊', body: '私聊支持拖入或粘贴图片，单张不超过 10MB；图片每 7 天清理一次，文字保留。' },
      { title: '聊天颜色', body: '自己的消息为蓝色，管理员消息为绿色，其他成员保持普通样式。' },
    ],
  },
  {
    id: '2026-11-25-admin',
    date: '2026-11-25',
    title: '账号管理与私聊审查',
    audience: 'admin',
    items: [
      { title: '账号管理', body: '用户、注册申请、邀请码、信箱和私聊收到一个页签，支持备注、停用、重置密码、删除和批量操作。' },
      { title: '私聊审查', body: '管理员可以按会话查看成员私聊；成员界面已明确提示管理员可见。' },
      { title: '管理员好友', body: '管理员也可以被加为好友，并进入自己的好友私聊。' },
    ],
  },
  {
    id: '2026-11-19',
    date: '2026-11-19',
    title: '知识链接与体验优化',
    audience: 'all',
    items: [
      { title: '知识链接升级', body: '正文里的页面/模块链接会显示为当前主题色；点击弹出快速预览窗口，不离开当前页面。' },
      { title: '知识链接抽屉', body: '出链和反向链接收到页面底部抽屉里，需要时展开；管理员和公开站都能看。' },
      { title: '复制链接修复', body: 'HTTP 环境下浏览器拒绝剪贴板时，自动改用兼容复制方式。' },
    ],
  },
];

export function updatesFor(role: 'admin' | 'reader' | 'guest') {
  return UPDATES.filter((update) => {
    if (role === 'admin') return true;
    if (role === 'reader') return update.audience !== 'admin';
    return update.audience === 'all';
  });
}

export function updateSeenKey(role: 'admin' | 'reader' | 'guest') {
  return `devforge.updates.seen.${role}.${UPDATES[0]?.id || 'none'}`;
}

export function hasUnseenUpdates(role: 'admin' | 'reader' | 'guest') {
  try {
    return localStorage.getItem(updateSeenKey(role)) !== '1';
  } catch {
    return true;
  }
}

export function markUpdatesSeen(role: 'admin' | 'reader' | 'guest') {
  try { localStorage.setItem(updateSeenKey(role), '1'); } catch { /* ignore */ }
}
