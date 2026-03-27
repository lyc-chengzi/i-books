export type ExpenseCopyDraft = {
  target: 'expense';
  copiedAt: number;
  values: {
    amount: number;
    occurredAt: string;
    categoryId: number;
    fundingSource: 'cash' | 'bank';
    bankAccountId: number | null;
    tagIds: number[];
    note: string | null;
  };
};

export type IncomeCopyDraft = {
  target: 'income';
  copiedAt: number;
  values: {
    amount: number;
    occurredAt: string;
    categoryId: number;
    fundingSource: 'cash' | 'bank';
    bankAccountId: number | null;
    note: string | null;
  };
};

export type TransferCopyDraft = {
  target: 'transfer';
  copiedAt: number;
  values: {
    amount: number;
    occurredAt: string;
    fromBankAccountId: number;
    toBankAccountId: number;
    note: string | null;
  };
};

export type LedgerCopyDraft = ExpenseCopyDraft | IncomeCopyDraft | TransferCopyDraft;

export const LEDGER_COPY_DRAFT_QUERY_KEY = ['ui', 'ledger', 'copyDraft'] as const;