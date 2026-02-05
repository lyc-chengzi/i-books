import type { CategoryNode } from '../../components/CategoryLeafSelect';

export function buildCategoryPathMap(roots: CategoryNode[]): Map<number, string> {
  const map = new Map<number, string>();

  const walk = (nodes: CategoryNode[], prefix: string[]) => {
    for (const n of nodes) {
      const nextPrefix = [...prefix, n.name];
      map.set(n.id, nextPrefix.join('/'));
      walk(n.children ?? [], nextPrefix);
    }
  };

  walk(roots ?? [], []);
  return map;
}

export function centsToYuan(cents: number): number {
  return Math.round((cents / 100) * 100) / 100;
}

export function formatYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function getLeafName(path: string): string {
  const parts = (path ?? '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}
