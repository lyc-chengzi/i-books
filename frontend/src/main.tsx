import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';

import { AuthProvider } from './auth/AuthProvider';
import { App } from './app/App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#d93a2f',
          borderRadius: 14,
          fontSize: 14,
          controlHeight: 36
        },
        components: {
          Layout: {
            headerPadding: '0 20px'
          },
          Card: {
            paddingLG: 18
          },
          Menu: {
            itemBorderRadius: 12
          },
          Button: {
            borderRadius: 12
          },
          Input: {
            borderRadius: 12
          },
          Select: {
            borderRadius: 12
          }
        }
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
