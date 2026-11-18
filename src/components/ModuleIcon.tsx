import type { Module } from '../types';

export function ModuleIconContent({ module }: { module: Pick<Module, 'icon' | 'iconUrl'> }) {
  if (module.iconUrl) {
    return <img className="module-custom-icon" src={module.iconUrl} alt="" loading="lazy" />;
  }
  return <>{module.icon}</>;
}
