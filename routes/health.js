const express = require('express');
const router = express.Router();
const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');

// Health check básico
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('../package.json').version
  });
});

// Health check detalhado
router.get('/detailed', async (req, res) => {
  const checks = {
    server: 'ok',
    supabase: 'checking',
    memory: 'ok',
    timestamp: new Date().toISOString()
  };

  try {
    // Testar conexão com Supabase
    await supabaseService.testConnection();
    checks.supabase = 'ok';
  } catch (error) {
    checks.supabase = 'error';
    checks.supabaseError = error.message;
  }

  // Verificar uso de memória
  const memUsage = process.memoryUsage();
  checks.memory = {
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
  };

  // Status geral
  const isHealthy = checks.supabase === 'ok';
  
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    checks,
    uptime: process.uptime(),
    version: require('../package.json').version
  });
});

// Ping simples
router.get('/ping', (req, res) => {
  res.json({ pong: true, timestamp: Date.now() });
});

module.exports = router;