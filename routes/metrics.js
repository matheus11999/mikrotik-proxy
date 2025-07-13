const express = require('express');
const { metricsCollector } = require('../middleware/metrics');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware de autenticação para dashboard
function authenticateDashboard(req, res, next) {
  const password = req.headers['x-dashboard-password'] || req.query.password;
  const correctPassword = process.env.DASHBOARD_PASSWORD;

  if (!correctPassword) {
    return res.status(500).json({
      error: 'Password do dashboard não configurada',
      code: 'DASHBOARD_PASSWORD_NOT_SET'
    });
  }

  if (!password) {
    return res.status(401).json({
      error: 'Password obrigatória para acessar dashboard',
      code: 'DASHBOARD_PASSWORD_REQUIRED',
      hint: 'Use header X-Dashboard-Password ou query param ?password=xxx'
    });
  }

  if (password !== correctPassword) {
    logger.warn('Tentativa de acesso ao dashboard com password incorreta', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(401).json({
      error: 'Password incorreta',
      code: 'DASHBOARD_INVALID_PASSWORD'
    });
  }

  next();
}

// GET /metrics - Estatísticas básicas
router.get('/', authenticateDashboard, (req, res) => {
  try {
    const stats = metricsCollector.getStats();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics: stats
    });
  } catch (error) {
    logger.error('Erro ao obter métricas:', error);
    res.status(500).json({
      error: 'Erro interno ao obter métricas',
      code: 'METRICS_ERROR'
    });
  }
});

// GET /metrics/detailed - Métricas detalhadas para dashboard
router.get('/detailed', authenticateDashboard, (req, res) => {
  try {
    const detailedMetrics = metricsCollector.getDetailedMetrics();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics: detailedMetrics
    });
  } catch (error) {
    logger.error('Erro ao obter métricas detalhadas:', error);
    res.status(500).json({
      error: 'Erro interno ao obter métricas detalhadas',
      code: 'DETAILED_METRICS_ERROR'
    });
  }
});

// GET /metrics/summary - Resumo para monitoramento externo
router.get('/summary', authenticateDashboard, (req, res) => {
  try {
    const stats = metricsCollector.getStats();
    
    // Resumo simplificado
    const summary = {
      status: 'healthy',
      uptime: stats.uptime.human,
      totalRequests: stats.requests.total,
      successRate: stats.requests.successRate,
      avgResponseTime: stats.performance.avgResponseTime,
      rateLimitHits: stats.performance.rateLimitHits,
      activeEndpoints: Object.keys(stats.topEndpoints).length,
      activeMikrotiks: Object.keys(stats.topMikrotiks).length
    };
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary
    });
  } catch (error) {
    logger.error('Erro ao obter resumo de métricas:', error);
    res.status(500).json({
      error: 'Erro interno ao obter resumo',
      code: 'SUMMARY_ERROR'
    });
  }
});

// POST /metrics/reset - Resetar métricas (útil para testes)
router.post('/reset', authenticateDashboard, (req, res) => {
  try {
    metricsCollector.reset();
    
    logger.info('Métricas resetadas via API', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: 'Métricas resetadas com sucesso',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao resetar métricas:', error);
    res.status(500).json({
      error: 'Erro interno ao resetar métricas',
      code: 'RESET_ERROR'
    });
  }
});

// GET /metrics/live - Endpoint para Server-Sent Events (streaming de métricas)
router.get('/live', authenticateDashboard, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Enviar métricas iniciais
  const sendMetrics = () => {
    try {
      const stats = metricsCollector.getStats();
      res.write(`data: ${JSON.stringify({
        timestamp: new Date().toISOString(),
        metrics: stats
      })}\n\n`);
    } catch (error) {
      logger.error('Erro ao enviar métricas via SSE:', error);
    }
  };

  // Enviar métricas a cada 5 segundos
  sendMetrics();
  const interval = setInterval(sendMetrics, 5000);

  // Cleanup quando cliente desconectar
  req.on('close', () => {
    clearInterval(interval);
    logger.debug('Cliente SSE desconectado');
  });

  req.on('aborted', () => {
    clearInterval(interval);
    logger.debug('Conexão SSE abortada');
  });
});

// GET /metrics/debug - Informações detalhadas de debug
router.get('/debug', authenticateDashboard, (req, res) => {
  try {
    const detailedMetrics = metricsCollector.getDetailedMetrics();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      debug: {
        recentRequests: detailedMetrics.debug.recentRequests,
        errorDetails: detailedMetrics.debug.errorDetails,
        totalErrorsStored: detailedMetrics.debug.totalErrorsStored,
        systemInfo: {
          nodeVersion: process.version,
          platform: process.platform,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage()
        }
      }
    });
  } catch (error) {
    logger.error('Erro ao obter informações de debug:', error);
    res.status(500).json({
      error: 'Erro interno ao obter debug',
      code: 'DEBUG_ERROR'
    });
  }
});

// GET /metrics/health - Health check específico do sistema de métricas
router.get('/health', (req, res) => {
  try {
    const stats = metricsCollector.getStats();
    const isHealthy = stats.requests.total >= 0; // Básico: se conseguir obter stats
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      metrics: {
        collecting: true,
        totalRequests: stats.requests.total,
        uptime: stats.uptime.human
      }
    });
  } catch (error) {
    logger.error('Erro no health check de métricas:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: 'Sistema de métricas com falha',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;