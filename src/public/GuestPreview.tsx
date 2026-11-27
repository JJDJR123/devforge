import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Inbox,
  Lock,
  MessageCircle,
  UserRound,
} from 'lucide-react';
import '../styles/public-guest.css';

type Feature = 'kb' | 'chat' | 'mailbox' | 'friends';

const META: Record<Feature, {
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof BookOpen;
  bullets: string[];
}> = {
  kb: {
    eyebrow: 'MEMBER KNOWLEDGE / 成员知识库',
    title: '成员知识库',
    description: '公开页面之外的拆解、配方、踩坑记录和可检索笔记，成员登录后可以完整阅读。',
    icon: BookOpen,
    bullets: ['阅读成员可见的知识条目', '按标题、正文、标签搜索', '在公开内容之外继续深挖'],
  },
  chat: {
    eyebrow: 'MEMBER CHAT / 聊天室',
    title: '成员聊天室',
    description: '和站长、其他成员在站内交流。游客可以看见入口和功能预览，但不会看到任何成员的真实聊天内容。',
    icon: MessageCircle,
    bullets: ['参与成员聊天室', '和站长直接交流', '只对已审批成员开放'],
  },
  mailbox: {
    eyebrow: 'MEMBER MAILBOX / 站内信箱',
    title: '站内信箱',
    description: '接收站内公告、管理员消息和成员私信。游客只能看到功能预览，看不到任何人的信箱。',
    icon: Inbox,
    bullets: ['接收更新公告', '和管理员站内通信', '消息只对账号本人可见'],
  },
  friends: {
    eyebrow: 'MEMBER FRIENDS / 好友与私信',
    title: '好友与私信',
    description: '添加好友、发私信、发送图片，把学习搭子留在站内。游客只能预览入口，不能添加或发送。',
    icon: UserRound,
    bullets: ['添加好友', '一对一私信', '支持图片消息'],
  },
};

export function GuestPreview({ feature }: { feature: Feature }) {
  const meta = META[feature];
  const Icon = meta.icon;

  useEffect(() => {
    const previous = document.title;
    document.title = `${meta.title} · 成员功能预览 · DEVFORGE`;
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex,nofollow,noarchive';
    document.head.append(robots);
    return () => {
      document.title = previous;
      robots.remove();
    };
  }, [meta.title]);

  return (
    <div className="guest-preview">
      <header className="guest-preview-head">
        <span className="guest-preview-eyebrow"><Lock size={12} /> {meta.eyebrow}</span>
        <h1>{meta.title}</h1>
        <p>{meta.description}</p>
        <div className="guest-preview-badges">
          <span><Lock size={11} /> 游客只读</span>
          <span>申请制 · 管理员审批</span>
        </div>
      </header>

      <div className="guest-preview-grid">
        <section className="guest-lock-card">
          <div className="guest-lock-icon"><Icon size={24} /></div>
          <h2>申请成员账号后可用</h2>
          <ul>
            {meta.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
          </ul>
          <Link className="btn btn-primary guest-apply" to="/apply">
            申请成员账号 <ArrowRight size={15} />
          </Link>
          <Link className="btn btn-ghost guest-back" to="/">
            <ArrowLeft size={14} /> 先看公开内容
          </Link>
          <p className="guest-privacy">不会向游客展示其他成员的真实聊天、信箱或私信内容。</p>
        </section>

        <section className="guest-mock" aria-hidden="true">
          <div className="guest-mock-head">
            <span>{meta.title}预览</span>
            <em>LOCKED</em>
          </div>
          <GuestMock feature={feature} />
        </section>
      </div>
    </div>
  );
}

function GuestMock({ feature }: { feature: Feature }) {
  if (feature === 'chat') {
    return (
      <div className="guest-chat-mock">
        <div className="guest-bubble is-other"><span>成员 A</span><p>这个拆解我按你的思路补完了。</p></div>
        <div className="guest-bubble is-other"><span>成员 B</span><p>配方里的参数表能分享一下吗？</p></div>
        <div className="guest-bubble is-own"><span>你（申请后）</span><p>可以，直接在成员知识库里看。</p></div>
        <div className="guest-mock-input"><Lock size={12} /> 登录后才能发言</div>
      </div>
    );
  }
  if (feature === 'mailbox') {
    return (
      <div className="guest-mail-mock">
        {['更新公告：本周新增拆解', '管理员：欢迎加入学习舱', '成员私信：一起做原型吗？'].map((title, index) => (
          <div className="guest-mail-row" key={title}>
            <span className="guest-mail-dot" />
            <span><strong>{title}</strong><em>{index === 0 ? '公告' : '站内消息'} · 登录后查看</em></span>
            <Lock size={12} />
          </div>
        ))}
      </div>
    );
  }
  if (feature === 'friends') {
    return (
      <div className="guest-friend-mock">
        {['学习搭子', '原型搭档', '美术朋友'].map((name) => (
          <div className="guest-friend-row" key={name}>
            <span className="guest-avatar">{name.slice(0, 1)}</span>
            <span><strong>{name}</strong><em>· 申请后添加</em></span>
            <Lock size={12} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="guest-kb-mock">
      {[
        ['拆解', '横版战斗的打击帧'],
        ['配方', '角色移动与镜头跟随'],
        ['笔记', 'Godot 状态机整理'],
      ].map(([kind, title]) => (
        <div className="guest-kb-row" key={title}>
          <span className="guest-kb-kind">{kind}</span>
          <span><strong>{title}</strong><em>成员可见 · 登录后阅读</em></span>
          <Lock size={12} />
        </div>
      ))}
    </div>
  );
}
