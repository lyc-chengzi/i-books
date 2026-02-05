import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Space,
  Switch,
  Tag,
  Tree,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMemo, useState } from 'react';

import { useAuth } from '../../auth/useAuth';
import { api } from '../../lib/api';

type CategoryType = 'income' | 'expense';

type CategoryNode = {
  id: number;
  type: CategoryType;
  name: string;
  parentId: number | null;
  sortOrder: number;
  isActive: boolean;
  isLeaf: boolean;
  children: CategoryNode[];
};

type CreatePayload = {
  type: CategoryType;
  name: string;
  parentId: number | null;
  sortOrder?: number;
  isActive: boolean;
};

type UpdatePayload = {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
};

type MovePayload = {
  parentId: number | null;
  index: number;
};

type CategoryTagDto = {
  id: number;
  categoryId: number;
  name: string;
  isActive: boolean;
};

type PathResult = {
  parent: CategoryNode | null;
  index: number;
};

function findParentAndIndex(nodes: CategoryNode[], id: number): PathResult | null {
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (n.id === id) return { parent: null, index: i };
    const child = findParentAndIndexInner(n, id);
    if (child) return child;
  }
  return null;
}

function findParentAndIndexInner(parent: CategoryNode, id: number): PathResult | null {
  const children = parent.children ?? [];
  for (let i = 0; i < children.length; i += 1) {
    const n = children[i];
    if (n.id === id) return { parent, index: i };
    const deeper = findParentAndIndexInner(n, id);
    if (deeper) return deeper;
  }
  return null;
}

function findNode(nodes: CategoryNode[], id: number): CategoryNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const child = findNode(n.children ?? [], id);
    if (child) return child;
  }
  return null;
}

function containsId(node: CategoryNode, id: number): boolean {
  if (node.id === id) return true;
  for (const child of node.children ?? []) {
    if (containsId(child, id)) return true;
  }
  return false;
}

function toTreeData(nodes: CategoryNode[]): DataNode[] {
  return nodes.map((n) => ({
    key: n.id,
    title: (
      <span style={{ opacity: n.isActive ? 1 : 0.45 }}>
        {n.name}
        {!n.isActive ? '（停用）' : ''}
      </span>
    ),
    children: toTreeData(n.children ?? [])
  }));
}

export function CategoryPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { message, modal } = AntdApp.useApp();

  const [type, setType] = useState<CategoryType>('expense');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<number | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);

  const [createForm] = Form.useForm<CreatePayload>();
  const [renameForm] = Form.useForm<{ name: string }>();

  const treeQuery = useQuery({
    queryKey: ['categoriesTree', type],
    queryFn: () => api.get<CategoryNode[]>(`/config/categories/tree?type=${type}`, { token: auth.token })
  });

  const selectedNode = useMemo(() => {
    if (!selectedId) return null;
    return findNode(treeQuery.data ?? [], selectedId);
  }, [selectedId, treeQuery.data]);

  const selectedParentNode = useMemo(() => {
    if (!selectedNode?.parentId) return null;
    return findNode(treeQuery.data ?? [], selectedNode.parentId);
  }, [selectedNode, treeQuery.data]);

  const isExpenseFirstLevel =
    type === 'expense' &&
    !!selectedNode &&
    selectedNode.parentId !== null &&
    !!selectedParentNode &&
    selectedParentNode.parentId === null;

  const tagsQuery = useQuery({
    queryKey: ['categoryTags', selectedNode?.id],
    enabled: !!selectedNode && isExpenseFirstLevel,
    queryFn: () =>
      api.get<CategoryTagDto[]>(`/config/categories/${selectedNode!.id}/tags?activeOnly=false`, { token: auth.token })
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreatePayload) => api.post<CategoryNode>('/config/categories', payload, { token: auth.token }),
    onSuccess: async () => {
      message.success('已创建');
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['categoriesTree'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdatePayload }) =>
      api.patch<CategoryNode>(`/config/categories/${id}`, payload, { token: auth.token }),
    onSuccess: async () => {
      message.success('已更新');
      setRenameOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['categoriesTree'] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/config/categories/${id}`, { token: auth.token }),
    onSuccess: async () => {
      message.success('已删除/停用');
      setSelectedId(null);
      await queryClient.invalidateQueries({ queryKey: ['categoriesTree'] });
    }
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: MovePayload }) =>
      api.patch(`/config/categories/${id}/move`, payload, { token: auth.token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categoriesTree'] });
    }
  });

  const createTagMutation = useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: number; name: string }) =>
      api.post<CategoryTagDto>(`/config/categories/${categoryId}/tags`, { name, isActive: true }, { token: auth.token }),
    onSuccess: async () => {
      message.success('标签已保存');
      await queryClient.invalidateQueries({ queryKey: ['categoryTags'] });
    }
  });

  const deleteTagMutation = useMutation({
    mutationFn: ({ categoryId, tagId }: { categoryId: number; tagId: number }) =>
      api.delete(`/config/categories/${categoryId}/tags/${tagId}`, { token: auth.token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categoryTags'] });
    }
  });

  const [newTagName, setNewTagName] = useState('');

  const submitNewTag = () => {
    if (!selectedNode) return;
    if (!isExpenseFirstLevel) return;
    const name = newTagName.trim();
    if (!name) return;
    createTagMutation.mutate({ categoryId: selectedNode.id, name });
    setNewTagName('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
      <Card
        title={type === 'expense' ? '费用分类维护' : '收入分类维护'}
        loading={treeQuery.isLoading}
        extra={
          <Space>
            <Radio.Group
              value={type}
              onChange={(e) => {
                setType(e.target.value as CategoryType);
                setSelectedId(null);
              }}
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: '费用', value: 'expense' },
                { label: '收入', value: 'income' }
              ]}
            />
            <Button
              onClick={() => {
                setCreateParentId(null);
                createForm.setFieldsValue({ type, parentId: null, name: '', sortOrder: 0, isActive: true });
                setCreateOpen(true);
              }}
            >
              新增根节点
            </Button>
            <Button
              disabled={!selectedNode}
              onClick={() => {
                setCreateParentId(selectedNode?.id ?? null);
                createForm.setFieldsValue({
                  type,
                  parentId: selectedNode?.id ?? null,
                  name: '',
                  isActive: true
                });
                createForm.setFieldValue('sortOrder', undefined);
                setCreateOpen(true);
              }}
            >
              新增子节点
            </Button>
          </Space>
        }
      >
        <Tree
          showLine
          blockNode
          draggable
          selectedKeys={selectedId ? [selectedId] : []}
          onSelect={(keys) => {
            const k = keys[0];
            if (typeof k === 'number') setSelectedId(k);
            else if (typeof k === 'string') setSelectedId(Number(k));
          }}
          onDrop={(info) => {
            const dragId = Number(info.dragNode.key);
            const dropId = Number(info.node.key);
            const tree = treeQuery.data ?? [];

            const dragNode = findNode(tree, dragId);
            if (!dragNode) return;

            const dropToGap = info.dropToGap;

            if (!dropToGap) {
              // Drop on node: become its child, append to end
              if (containsId(dragNode, dropId)) {
                message.warning('不能移动到自身或子节点下');
                return;
              }
              const dropNode = findNode(tree, dropId);
              if (!dropNode) return;
              const index = (dropNode.children ?? []).length;
              moveMutation.mutate({ id: dragId, payload: { parentId: dropId, index } });
              return;
            }

            // Drop into gap: same parent as drop node
            const dropPos = findParentAndIndex(tree, dropId);
            if (!dropPos) return;
            const parentId = dropPos.parent?.id ?? null;

            if (parentId !== null && containsId(dragNode, parentId)) {
              message.warning('不能移动到自身或子节点下');
              return;
            }

            // Compute target index among siblings after removal
            const siblings = dropPos.parent ? dropPos.parent.children ?? [] : tree;
            const fromPos = findParentAndIndex(tree, dragId);
            const fromSameParent = (fromPos?.parent?.id ?? null) === parentId;

            const rawTargetIndex = dropPos.index + (info.dropPosition > 0 ? 1 : 0);
            let targetIndex = rawTargetIndex;

            if (fromSameParent && fromPos) {
              // If moving within same sibling list and dragging from before the insertion point,
              // the removal shifts indices by -1.
              if (fromPos.index < rawTargetIndex) targetIndex -= 1;
            }

            // Clamp to [0, siblings.length] after removal
            const siblingCountAfterRemoval = fromSameParent && fromPos ? siblings.length - 1 : siblings.length;
            if (targetIndex < 0) targetIndex = 0;
            if (targetIndex > siblingCountAfterRemoval) targetIndex = siblingCountAfterRemoval;

            moveMutation.mutate({ id: dragId, payload: { parentId, index: targetIndex } });
          }}
          treeData={toTreeData(treeQuery.data ?? [])}
        />
      </Card>

      <Card title={type === 'expense' ? '费用分类操作' : '收入分类操作'} style={{ height: 'fit-content' }}>
        {!selectedNode ? (
          <Typography.Text type="secondary">选择左侧一个节点后操作</Typography.Text>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <Typography.Text strong>{selectedNode.name}</Typography.Text>
              <div style={{ marginTop: 6 }}>
                <Typography.Text type="secondary">
                  ID: {selectedNode.id} · {selectedNode.type === 'expense' ? '费用' : '收入'} ·
                  {selectedNode.isLeaf ? '叶子' : '非叶子'}
                </Typography.Text>
              </div>
            </div>

            <Space>
              <Button
                onClick={() => {
                  renameForm.setFieldsValue({ name: selectedNode.name });
                  setRenameOpen(true);
                }}
              >
                重命名
              </Button>
              <Button
                onClick={() => updateMutation.mutate({ id: selectedNode.id, payload: { isActive: !selectedNode.isActive } })}
                loading={updateMutation.isPending}
              >
                {selectedNode.isActive ? '停用' : '启用'}
              </Button>
            </Space>

            <Button
              danger
              disabled={!selectedNode.isLeaf}
              onClick={() => {
                modal.confirm({
                  title: '确认删除该节点？',
                  content: selectedNode.isLeaf
                    ? '如果该节点已被流水引用，将自动改为“停用”以保证历史可追溯。'
                    : '该节点有子节点，不能直接停用/删除。',
                  okText: '确认',
                  cancelText: '取消',
                  onOk: async () => {
                    if (!selectedNode.isLeaf) return;
                    deleteMutation.mutate(selectedNode.id);
                  }
                });
              }}
              loading={deleteMutation.isPending}
            >
              删除（叶子）
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              说明：叶子节点若未被引用会直接删除；否则仅停用。非叶子节点需先处理子节点。
            </Typography.Text>

            {isExpenseFirstLevel ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <Typography.Text strong>费用一级分类标签</Typography.Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onPressEnter={(e) => {
                      e.preventDefault();
                      submitNewTag();
                    }}
                    placeholder="输入标签名，如：外卖/聚餐/烟酒"
                    maxLength={100}
                  />
                  <Button
                    type="primary"
                    disabled={!newTagName.trim()}
                    loading={createTagMutation.isPending}
                    onClick={() => {
                      submitNewTag();
                    }}
                  >
                    新增
                  </Button>
                </Space.Compact>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(tagsQuery.data ?? []).length === 0 ? (
                    <Typography.Text type="secondary">暂无标签</Typography.Text>
                  ) : (
                    (tagsQuery.data ?? []).map((t) => (
                      <Tag
                        key={t.id}
                        color={t.isActive ? 'blue' : 'default'}
                        closable={t.isActive}
                        onClose={(e) => {
                          e.preventDefault();
                          deleteTagMutation.mutate({ categoryId: selectedNode.id, tagId: t.id });
                        }}
                        style={{ opacity: t.isActive ? 1 : 0.55 }}
                      >
                        {t.name}
                        {!t.isActive ? '（停用）' : ''}
                      </Tag>
                    ))
                  )}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  说明：标签仅用于“费用一级分类”。若标签已被流水引用，删除会改为停用。
                </Typography.Text>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <Modal
        title={createParentId ? '新增子节点' : '新增根节点'}
        open={createOpen}
        okText="创建"
        cancelText="取消"
        confirmLoading={createMutation.isPending}
        onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          const values = await createForm.validateFields();
          createMutation.mutate(values);
        }}
      >
        <Form form={createForm} layout="vertical" initialValues={{ type, parentId: null, sortOrder: 0, isActive: true }}>
          <Form.Item label="类型" name="type" rules={[{ required: true }]}>
            <Radio.Group
              options={[
                { label: '费用', value: 'expense' },
                { label: '收入', value: 'income' }
              ]}
              optionType="button"
              buttonStyle="solid"
              disabled
            />
          </Form.Item>
          <Form.Item label="上级" name="parentId">
            <Input disabled value={createParentId ?? ''} placeholder={createParentId ? String(createParentId) : '（无，上级为空）'} />
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="例如：日常消费 / 超市购物" />
          </Form.Item>
          <Form.Item label="启用" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
          {createParentId ? null : (
            <Form.Item label="排序" name="sortOrder" tooltip="数字越小越靠前（可选）">
              <InputNumber style={{ width: 140 }} />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="重命名"
        open={renameOpen}
        okText="保存"
        cancelText="取消"
        confirmLoading={updateMutation.isPending}
        onCancel={() => setRenameOpen(false)}
        onOk={async () => {
          if (!selectedNode) return;
          const values = await renameForm.validateFields();
          updateMutation.mutate({ id: selectedNode.id, payload: { name: values.name } });
        }}
      >
        <Form form={renameForm} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
