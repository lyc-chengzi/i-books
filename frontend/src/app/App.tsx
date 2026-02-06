import { Navigate, Route, Routes } from 'react-router-dom';

import { RequireAuth } from '../auth/RequireAuth';
import { RequireAdmin } from '../auth/RequireAdmin';
import { LoginPage } from '../pages/LoginPage';
import { RootLayout } from './layouts/RootLayout';
import { LedgerLayout } from './layouts/LedgerLayout';
import { StatsLayout } from './layouts/StatsLayout';
import { ConfigLayout } from './layouts/ConfigLayout';

import { TransactionCreateExpensePage } from '../pages/ledger/TransactionCreateExpensePage';
import { TransactionCreateIncomePage } from '../pages/ledger/TransactionCreateIncomePage';
import { TransferCreatePage } from '../pages/ledger/TransferCreatePage';
import { TransactionListPage } from '../pages/ledger/TransactionListPage';

import { YearCategoryStatsPage } from '../pages/stats/YearCategoryStatsPage';
import { YoYStatsPage } from '../pages/stats/YoYStatsPage';
import { CategoryMonthlyLinePage } from '../pages/stats/CategoryMonthlyLinePage';

import { BankAccountPage } from '../pages/config/BankAccountPage';
import { CategoryPage } from '../pages/config/CategoryPage';
import { UserPage } from '../pages/config/UserPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RootLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/ledger/expense/new" replace />} />

        <Route path="ledger" element={<LedgerLayout />}>
          <Route path="expense/new" element={<TransactionCreateExpensePage />} />
          <Route path="income/new" element={<TransactionCreateIncomePage />} />
          <Route path="transfers/new" element={<TransferCreatePage />} />
          <Route path="transactions/new" element={<Navigate to="/ledger/expense/new" replace />} />
          <Route path="transactions" element={<Navigate to="/ledger/expense/new" replace />} />
        </Route>

        <Route path="stats" element={<StatsLayout />}>
          <Route path="year-category" element={<YearCategoryStatsPage />} />
          <Route path="yoy" element={<YoYStatsPage />} />
          <Route path="category-monthly" element={<CategoryMonthlyLinePage />} />
        </Route>

        <Route path="config" element={<ConfigLayout />}>
          <Route
            path="users"
            element={
              <RequireAdmin>
                <UserPage />
              </RequireAdmin>
            }
          />
          <Route path="categories" element={<CategoryPage />} />
          <Route path="bank-accounts" element={<BankAccountPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
