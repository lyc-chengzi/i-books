import { Alert } from 'antd';

export function UserPage() {
  return (
    <Alert
      type="info"
      showIcon
      message="用户管理"
      description="下一步：实现用户创建/禁用，并完善密码哈希策略（argon2/bcrypt）。"
    />
  );
}
