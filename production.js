#!/usr/bin/env node

// Configurações de produção otimizadas
process.env.NODE_ENV = 'production';

// Configurações de performance
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '16';

// Configurar uncaughtException e unhandledRejection
process.on('uncaughtException', (error) => {
  console.error('🚨 UNCAUGHT EXCEPTION! Shutting down...');
  console.error(error.name, error.message);
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED REJECTION! Shutting down...');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

// Configurações de memory management
if (process.env.NODE_OPTIONS && !process.env.NODE_OPTIONS.includes('--max-old-space-size')) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`;
}

// Importar aplicação principal
require('./server.js');

// Configurações de graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Dar tempo para requisições ativas terminarem
  setTimeout(() => {
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Log de inicialização
console.log('🚀 MikroTik Proxy API - PRODUCTION MODE');
console.log(`📊 UV_THREADPOOL_SIZE: ${process.env.UV_THREADPOOL_SIZE}`);
console.log(`💾 Max Old Space Size: ${process.env.NODE_OPTIONS}`);
console.log(`⚡ Rate Limits: Global=${process.env.GLOBAL_RATE_LIMIT_MAX_REQUESTS}, User=${process.env.USER_RATE_LIMIT_MAX_REQUESTS}`);