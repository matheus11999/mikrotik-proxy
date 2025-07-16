const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const supabaseService = require('./services/supabaseService');
const mikrotikProxy = require('./routes/secureMikrotik');
const testMikrotikRouter = require('./routes/testMikrotik');
const templatesRouter = require('./routes/templates');
const healthRouter = require('./routes/health');
const metricsRouter = require('./routes/metrics');
const { collectMetrics, trackRateLimit } = require('./middleware/metrics');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares de segurança - Desabilitar CSP para desenvolvimento
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-MikroTik-ID', 'X-Dashboard-Password']
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting global otimizado para produção
const globalRateLimit = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minuto
  max: parseInt(process.env.GLOBAL_RATE_LIMIT_MAX_REQUESTS) || 200, // Aumentado para produção
  message: {
    error: 'Muitas requisições. Tente novamente em 1 minuto.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Pular rate limit global para health checks e métricas
    return req.path.startsWith('/health') || req.path.startsWith('/metrics');
  },
  keyGenerator: (req) => {
    // Rate limit otimizado baseado no IP
    return req.ip;
  }
});

app.use(globalRateLimit);

// Middleware de métricas
app.use(collectMetrics);
app.use(trackRateLimit);

// Servir arquivos estáticos para dashboard
app.use(express.static('public'));

// Middleware de logging
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      token: req.headers.authorization ? req.headers.authorization.replace('Bearer ', '').substring(0, 8) + '...' : null
    });
  });
  
  next();
});

// Rota principal - redirecionar para dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard.html');
});

// Rotas
app.use('/health', healthRouter);
app.use('/metrics', metricsRouter);
app.use('/api/mikrotik', templatesRouter); // Templates routes (sem autenticação)
app.use('/api/mikrotik', mikrotikProxy);
app.use('/test/mikrotik', testMikrotikRouter); // Rota de teste

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
});

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    code: 'NOT_FOUND'
  });
});

// Inicialização do servidor
async function startServer() {
  try {
    // Teste conexão com Supabase
    await supabaseService.testConnection();
    logger.info('Conexão com Supabase estabelecida');

    app.listen(PORT, () => {
      logger.info(`🚀 MikroTik Proxy API iniciada na porta ${PORT}`);
      logger.info(`📊 Rate limit: ${process.env.RATE_LIMIT_MAX_REQUESTS || 100} req/min`);
      logger.info(`🔒 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Tratamento de sinais do sistema
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido, fechando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido, fechando servidor...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();