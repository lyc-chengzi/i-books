import { useQuery } from '@tanstack/react-query';
import { TreeSelect, type TreeSelectProps } from 'antd';
import type { CSSProperties } from 'react';
import { useEffect, useMemo } from 'react';

import { useAuth } from '../auth/useAuth';
import { api } from '../lib/api';

export type CategoryType = 'income' | 'expense';

export type CategoryNode = {
  id: number;
  type: CategoryType;
  name: string;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
  isLeaf: boolean;
  children: CategoryNode[];
};

function findPath(nodes: CategoryNode[], id: number): number[] | null {
  for (const n of nodes) {
    if (n.id === id) return [n.id];
    const child = findPath(n.children ?? [], id);
    if (child) return [n.id, ...child];
  }
  return null;
}

export function CategoryLeafSelect({
  type,
  value,
  onChange,
  onTopLevelChange,
  style,
  allowClear = true
}: {
  type: CategoryType;
  value?: number;
  onChange?: (id?: number) => void;
  onTopLevelChange?: (topLevelId: number | null) => void;
  style?: CSSProperties;
  allowClear?: boolean;
}) {
  const auth = useAuth();

  const categoriesQuery = useQuery({
    queryKey: ['categoriesTree', type],
    queryFn: () => api.get<CategoryNode[]>(`/config/categories/tree?type=${type}`, { token: auth.token })
  });

  const treeData: TreeSelectProps['treeData'] = (categoriesQuery.data ?? []).map(function mapNode(n): any {
    return {
      value: n.id,
      title: `${n.name}${n.isActive ? '' : '（停用）'}`,
      disabled: !n.isActive || !n.isLeaf,
      children: (n.children ?? []).map(mapNode)
    };
  });

  const topLevelId = useMemo(() => {
    if (!value) return null;
    const path = findPath(categoriesQuery.data ?? [], value);
    if (!path || path.length < 2) return null;
    return path[1];
  }, [value, categoriesQuery.data]);

  useEffect(() => {
    onTopLevelChange?.(type === 'expense' ? topLevelId : null);
  }, [type, topLevelId, onTopLevelChange]);

  return (
    <TreeSelect
      style={style}
      loading={categoriesQuery.isLoading}
      treeData={treeData}
      placeholder="请先在 配置/分类 中维护分类树"
      treeDefaultExpandAll
      showSearch
      allowClear={allowClear}
      value={value}
      onChange={(v) => {
        if (typeof v === 'number') onChange?.(v);
        else if (typeof v === 'string') onChange?.(Number(v));
        else onChange?.(undefined);
      }}
    />
  );
}
