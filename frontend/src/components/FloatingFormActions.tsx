import { Button } from 'antd';

export function FloatingFormActions({
  onSave,
  onReset,
  saveLoading,
  saveText = '保存',
  resetText = '重置',
  disabled
}: {
  onSave: () => void;
  onReset: () => void;
  saveLoading?: boolean;
  saveText?: string;
  resetText?: string;
  disabled?: boolean;
}) {
  return (
    <div className="ledger-floating-actions" aria-label="表单操作">
      <Button onClick={onReset} disabled={disabled}>
        {resetText}
      </Button>
      <Button type="primary" onClick={onSave} loading={saveLoading} disabled={disabled}>
        {saveText}
      </Button>
    </div>
  );
}
