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
      startTime: Date.now(),
      // Informações de debug
      recentRequests: [], // Últimas 50 requisições para debug
      errorDetails: [],   // Detalhes dos últimos erros
      // Cache de status offline
      offlineDevices: new Map(), // Cache de dispositivos offline
      offlineCacheDuration: 30000 // 30 segundos
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
    
    // Ignorar requisições do dashboard e arquivos estáticos
    const shouldIgnore = this.shouldIgnoreRequest(req);
    
    if (!shouldIgnore) {
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
    }

    // Interceptar resposta
    res.send = function(data) {
      const responseTime = Date.now() - startTime;
      
      if (!shouldIgnore) {
        // Coletar tempo de resposta
        metricsCollector.metrics.responseTimes.push({
          time: responseTime,
          timestamp: Date.now()
        });
        
        // Manter apenas os últimos 1000 tempos de resposta
        if (metricsCollector.metrics.responseTimes.length > 1000) {
          metricsCollector.metrics.responseTimes = metricsCollector.metrics.responseTimes.slice(-1000);
        }
        
        // Classificar resposta baseada no conteúdo, não apenas status HTTP
        const isSuccess = metricsCollector.isSuccessfulResponse(res.statusCode, data, req.mikrotik);
        
        if (isSuccess) {
          metricsCollector.metrics.successfulRequests++;
        } else {
          metricsCollector.metrics.failedRequests++;
          
          // Rastrear tipos de erro de forma mais inteligente
          const errorType = metricsCollector.getSmartErrorType(res.statusCode, data);
          metricsCollector.metrics.errorsByType[errorType] = (metricsCollector.metrics.errorsByType[errorType] || 0) + 1;
        }
        
        // Adicionar informações de debug
        const requestInfo = {
          timestamp: Date.now(),
          method: req.method,
          endpoint: req.route?.path || req.path,
          fullUrl: req.originalUrl,
          statusCode: res.statusCode,
          responseTime,
          mikrotik: req.mikrotik ? {
            id: req.mikrotik.id,
            nome: req.mikrotik.nome,
            ip: req.mikrotik.ip
          } : null,
          isSuccess,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        };

        // Armazenar requisição recente para debug
        metricsCollector.metrics.recentRequests.push(requestInfo);
        if (metricsCollector.metrics.recentRequests.length > 50) {
          metricsCollector.metrics.recentRequests = metricsCollector.metrics.recentRequests.slice(-50);
        }

        // Se houve erro, armazenar detalhes
        if (!isSuccess) {
          const errorDetail = {
            ...requestInfo,
            responseData: data,
            errorType: metricsCollector.getSmartErrorType(res.statusCode, data)
          };
          
          metricsCollector.metrics.errorDetails.push(errorDetail);
          if (metricsCollector.metrics.errorDetails.length > 100) {
            metricsCollector.metrics.errorDetails = metricsCollector.metrics.errorDetails.slice(-100);
          }
        }
        
        // Log de métrica apenas para APIs importantes
        logger.info('Request metrics', {
          method: req.method,
          endpoint: req.route?.path || req.path,
          statusCode: res.statusCode,
          responseTime: `${responseTime}ms`,
          mikrotik: req.mikrotik?.nome || 'unknown',
          isSuccess
        });
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  }

  // Verificar se deve ignorar a requisição
  shouldIgnoreRequest(req) {
    const ignoredPaths = [
      '/dashboard.html',
      '/metrics',
      '/health',
      '/favicon.ico',
      '/',
      '/index.html'
    ];
    
    const path = req.path;
    
    // Ignorar arquivos estáticos e dashboard
    if (ignoredPaths.includes(path) || 
        path.startsWith('/metrics/') || 
        path.endsWith('.css') || 
        path.endsWith('.js') || 
        path.endsWith('.ico') || 
        path.endsWith('.png') || 
        path.endsWith('.jpg')) {
      return true;
    }
    
    return false;
  }

  // Determinar se a resposta foi bem-sucedida baseado no conteúdo
  isSuccessfulResponse(statusCode, responseData, mikrotikInfo = null) {
    // Status HTTP indica sucesso
    if (statusCode >= 200 && statusCode < 400) {
      // Verificar se é uma resposta da API MikroTik com erro semântico
      try {
        const data = typeof responseData === 'string' ? JSON.parse(responseData) : responseData;
        
        // Se tem propriedade 'success', usar ela
        if (data.hasOwnProperty('success')) {
          // Dispositivo offline é um status válido, não erro
          if (!data.success && data.code === 'DEVICE_OFFLINE') {
            // Adicionar ao cache de offline
            if (mikrotikInfo) {
              const cacheKey = `${mikrotikInfo.id || mikrotikInfo.ip}`;
              this.metrics.offlineDevices.set(cacheKey, {
                timestamp: Date.now(),
                mikrotik: mikrotikInfo,
                details: data
              });
            }
            return true; // Offline é um status válido, não erro
          }
          
          return data.success === true;
        }
        
        // Códigos específicos de dispositivo offline não são erros
        if (data.code && ['DEVICE_OFFLINE', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(data.code)) {
          if (mikrotikInfo) {
            const cacheKey = `${mikrotikInfo.id || mikrotikInfo.ip}`;
            this.metrics.offlineDevices.set(cacheKey, {
              timestamp: Date.now(),
              mikrotik: mikrotikInfo,
              details: data
            });
          }
          return true; // Offline é um status válido
        }
        
        // Credenciais inválidas são erro real
        if (data.code && ['INVALID_CREDENTIALS', 'ACCESS_DENIED'].includes(data.code)) {
          return false;
        }
        
        return true;
      } catch (e) {
        // Se não conseguir fazer parse, considerar sucesso se status HTTP for ok
        return true;
      }
    }
    
    return false;
  }

  // Determinar tipo de erro de forma mais inteligente
  getSmartErrorType(statusCode, responseData) {
    if (statusCode === 429) return 'RATE_LIMIT';
    if (statusCode === 401) return 'AUTHENTICATION';
    if (statusCode === 403) return 'AUTHORIZATION';
    if (statusCode === 404) return 'NOT_FOUND';
    if (statusCode >= 500) return 'SERVER_ERROR';
    
    // Analisar conteúdo da resposta para erros semânticos
    try {
      const data = typeof responseData === 'string' ? JSON.parse(responseData) : responseData;
      
      if (data.code) {
        // Categorizar códigos específicos do MikroTik
        switch (data.code) {
          case 'DEVICE_OFFLINE':
          case 'ECONNREFUSED':
          case 'ETIMEDOUT':
          case 'ENOTFOUND':
            return 'MIKROTIK_OFFLINE';
          
          case 'INVALID_CREDENTIALS':
          case 'ACCESS_DENIED':
            return 'MIKROTIK_AUTH_ERROR';
          
          case 'ENDPOINT_NOT_FOUND':
          case 'MIKROTIK_API_ERROR':
            return 'MIKROTIK_API_ERROR';
          
          default:
            return data.code;
        }
      }
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
      debug: {
        recentRequests: this.metrics.recentRequests.slice(-20), // Últimas 20 requisições
        errorDetails: this.metrics.errorDetails.slice(-20),     // Últimos 20 erros
        totalErrorsStored: this.metrics.errorDetails.length,
        offlineDevices: Array.from(this.metrics.offlineDevices.entries()).map(([key, entry]) => ({
          key,
          mikrotik: entry.mikrotik,
          offlineSince: new Date(entry.timestamp).toISOString(),
          cacheExpiresIn: Math.max(0, this.metrics.offlineCacheDuration - (Date.now() - entry.timestamp)),
          details: entry.details
        }))
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
      startTime: Date.now(),
      recentRequests: [],
      errorDetails: []
    };
    
    logger.info('Métricas resetadas');
  }

  // Verificar se dispositivo está em cache offline
  isDeviceCachedOffline(mikrotikInfo) {
    if (!mikrotikInfo) return false;
    
    const cacheKey = `${mikrotikInfo.id || mikrotikInfo.ip}`;
    const cachedEntry = this.metrics.offlineDevices.get(cacheKey);
    
    if (!cachedEntry) return false;
    
    // Verificar se cache ainda é válido (30 segundos)
    const isValid = (Date.now() - cachedEntry.timestamp) < this.metrics.offlineCacheDuration;
    
    if (!isValid) {
      this.metrics.offlineDevices.delete(cacheKey);
      return false;
    }
    
    return cachedEntry;
  }

  // Limpar cache de dispositivos offline expirados
  cleanExpiredOfflineCache() {
    const now = Date.now();
    for (const [key, entry] of this.metrics.offlineDevices.entries()) {
      if ((now - entry.timestamp) >= this.metrics.offlineCacheDuration) {
        this.metrics.offlineDevices.delete(key);
      }
    }
  }

  // Limpar métricas antigas (mais de 1 hora)
  cleanOldMetrics() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    // Limpar response times antigos
    this.metrics.responseTimes = this.metrics.responseTimes
      .filter(r => r.timestamp > oneHourAgo);
    
    // Limpar cache de offline expirado
    this.cleanExpiredOfflineCache();
    
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