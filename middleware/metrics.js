const logger = require('../utils/logger');

class MetricsCollector {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errorsByType: {},
      requestsByEndpoint: {},
      requestsByMikrotik: {},
      rateLimitHits: 0,
      startTime: Date.now()
    };
    
    // Limpar métricas antigas a cada hora
    setInterval(() => {
      this.cleanOldMetrics();
    }, 60 * 60 * 1000);
  }

  // Middleware para coletar métricas
  collect(req, res, next) {
    const startTime = Date.now();
    const originalSend = res.send;
    
    // Incrementar contador de requisições
    this.metrics.totalRequests++;
    
    // Rastrear endpoint
    const endpoint = req.route?.path || req.path;
    this.metrics.requestsByEndpoint[endpoint] = (this.metrics.requestsByEndpoint[endpoint] || 0) + 1;
    
    // Rastrear MikroTik se disponível
    if (req.mikrotik?.id) {
      const mikrotikKey = `${req.mikrotik.nome} (${req.mikrotik.ip})`;
      this.metrics.requestsByMikrotik[mikrotikKey] = (this.metrics.requestsByMikrotik[mikrotikKey] || 0) + 1;
    }

    // Interceptar resposta
    res.send = function(data) {
      const responseTime = Date.now() - startTime;
      
      // Coletar tempo de resposta
      metricsCollector.metrics.responseTimes.push({
        time: responseTime,
        timestamp: Date.now()
      });
      
      // Manter apenas os últimos 1000 tempos de resposta
      if (metricsCollector.metrics.responseTimes.length > 1000) {
        metricsCollector.metrics.responseTimes = metricsCollector.metrics.responseTimes.slice(-1000);
      }
      
      // Contar sucessos e falhas
      if (res.statusCode >= 200 && res.statusCode < 400) {
        metricsCollector.metrics.successfulRequests++;
      } else {
        metricsCollector.metrics.failedRequests++;
        
        // Rastrear tipos de erro
        const errorType = metricsCollector.getErrorType(res.statusCode, data);
        metricsCollector.metrics.errorsByType[errorType] = (metricsCollector.metrics.errorsByType[errorType] || 0) + 1;
      }
      
      // Log de métrica
      logger.info('Request metrics', {
        method: req.method,
        endpoint,
        statusCode: res.statusCode,
        responseTime: `${responseTime}ms`,
        mikrotik: req.mikrotik?.nome || 'unknown'
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  }

  // Determinar tipo de erro baseado no status e resposta
  getErrorType(statusCode, responseData) {
    if (statusCode === 429) return 'RATE_LIMIT';
    if (statusCode === 401) return 'AUTHENTICATION';
    if (statusCode === 403) return 'AUTHORIZATION';
    if (statusCode === 404) return 'NOT_FOUND';
    if (statusCode >= 500) return 'SERVER_ERROR';
    
    // Tentar extrair do corpo da resposta
    try {
      const data = typeof responseData === 'string' ? JSON.parse(responseData) : responseData;
      if (data.code) return data.code;
    } catch (e) {
      // Ignorar erro de parse
    }
    
    return 'UNKNOWN_ERROR';
  }

  // Incrementar contador de rate limit
  incrementRateLimit() {
    this.metrics.rateLimitHits++;
  }

  // Obter estatísticas atuais
  getStats() {
    const now = Date.now();
    const uptimeMs = now - this.metrics.startTime;
    
    // Calcular tempo médio de resposta dos últimos 100 requests
    const recentResponseTimes = this.metrics.responseTimes
      .filter(r => now - r.timestamp < 60000) // Último minuto
      .map(r => r.time);
    
    const avgResponseTime = recentResponseTimes.length > 0 
      ? Math.round(recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length)
      : 0;

    // Calcular taxa de sucesso
    const successRate = this.metrics.totalRequests > 0 
      ? Math.round((this.metrics.successfulRequests / this.metrics.totalRequests) * 100)
      : 100;

    // Calcular requests por minuto (última hora)
    const requestsPerMinute = Math.round(this.metrics.totalRequests / (uptimeMs / 60000));

    // Top 5 endpoints mais usados
    const topEndpoints = Object.entries(this.metrics.requestsByEndpoint)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([endpoint, count]) => ({ endpoint, count }));

    // Top 5 MikroTiks mais acessados
    const topMikrotiks = Object.entries(this.metrics.requestsByMikrotik)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([mikrotik, count]) => ({ mikrotik, count }));

    return {
      uptime: {
        ms: uptimeMs,
        human: this.formatUptime(uptimeMs)
      },
      requests: {
        total: this.metrics.totalRequests,
        successful: this.metrics.successfulRequests,
        failed: this.metrics.failedRequests,
        successRate: `${successRate}%`,
        perMinute: requestsPerMinute
      },
      performance: {
        avgResponseTime: `${avgResponseTime}ms`,
        rateLimitHits: this.metrics.rateLimitHits
      },
      errors: this.metrics.errorsByType,
      topEndpoints,
      topMikrotiks
    };
  }

  // Obter métricas detalhadas para dashboard
  getDetailedMetrics() {
    const stats = this.getStats();
    const now = Date.now();

    // Histórico de response times dos últimos 30 minutos
    const responseTimeHistory = [];
    for (let i = 30; i >= 0; i--) {
      const timeWindow = now - (i * 60000); // i minutos atrás
      const windowTimes = this.metrics.responseTimes
        .filter(r => r.timestamp >= timeWindow - 30000 && r.timestamp < timeWindow + 30000)
        .map(r => r.time);
      
      const avgTime = windowTimes.length > 0 
        ? Math.round(windowTimes.reduce((a, b) => a + b, 0) / windowTimes.length)
        : 0;
      
      responseTimeHistory.push({
        timestamp: timeWindow,
        avgResponseTime: avgTime,
        requestCount: windowTimes.length
      });
    }

    return {
      ...stats,
      history: {
        responseTimes: responseTimeHistory
      },
      raw: {
        allEndpoints: this.metrics.requestsByEndpoint,
        allMikrotiks: this.metrics.requestsByMikrotik,
        totalResponseTimes: this.metrics.responseTimes.length
      }
    };
  }

  // Resetar métricas
  reset() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errorsByType: {},
      requestsByEndpoint: {},
      requestsByMikrotik: {},
      rateLimitHits: 0,
      startTime: Date.now()
    };
    
    logger.info('Métricas resetadas');
  }

  // Limpar métricas antigas (mais de 1 hora)
  cleanOldMetrics() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    // Limpar response times antigos
    this.metrics.responseTimes = this.metrics.responseTimes
      .filter(r => r.timestamp > oneHourAgo);
    
    logger.debug('Métricas antigas limpas');
  }

  // Formatar uptime
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

// Instância singleton
const metricsCollector = new MetricsCollector();

// Middleware para rate limit metrics
function trackRateLimit(req, res, next) {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (res.statusCode === 429) {
      metricsCollector.incrementRateLimit();
    }
    return originalSend.call(this, data);
  };
  
  next();
}

module.exports = {
  metricsCollector,
  collectMetrics: metricsCollector.collect.bind(metricsCollector),
  trackRateLimit
};