const express = require('express');
const router = express.Router();
const mikrotikService = require('../services/mikrotikService');
const supabaseService = require('../services/supabaseService');
const { authenticateByUserSession, rateLimitByUser } = require('../middleware/secureAuth');
const { metricsCollector } = require('../middleware/metrics');
const logger = require('../utils/logger');

// Rate limiting baseado no usuário (60 req/min por usuário)
const userRateLimit = rateLimitByUser(
  parseInt(process.env.USER_RATE_LIMIT_MAX_REQUESTS) || 60, 
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000
);

// Rota segura para fazer requisições genéricas para a API REST do MikroTik
router.all('/:mikrotikId/rest/*', 
  authenticateByUserSession,
  userRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;
      const endpoint = '/' + req.params[0]; // Captura tudo após /rest/
      const method = req.method;
      const data = ['POST', 'PUT', 'PATCH'].includes(method) ? req.body : null;

      logger.info(`Secure proxy request to MikroTik`, {
        mikrotikId,
        endpoint,
        method,
        hasData: !!data,
        userId: req.user.id,
        userEmail: req.user.email
      });

      // Verificar se dispositivo está em cache como offline
      const cachedOffline = metricsCollector.isDeviceCachedOffline(req.mikrotik);
      if (cachedOffline) {
        logger.info(`MikroTik ${req.mikrotik.nome} está em cache como offline`, {
          cacheExpiresIn: cachedOffline.cacheExpiresIn,
          mikrotikId,
          userId: req.user.id
        });
        
        // Retornar resposta cached sem fazer nova requisição
        return res.status(200).json({
          success: false,
          error: 'MikroTik offline (cached)',
          code: 'DEVICE_OFFLINE',
          responseTime: 0,
          cached: true,
          cacheExpiresIn: Math.max(0, metricsCollector.metrics.offlineCacheDuration - (Date.now() - cachedOffline.timestamp))
        });
      }

      // Fazer a requisição para o MikroTik
      const result = await mikrotikService.makeRequest(req.mikrotik, endpoint, method, data);
      const responseTime = Date.now() - startTime;

      // Log da requisição
      await supabaseService.logApiAccess(mikrotikId, endpoint, method, result.success, responseTime);

      if (result.success) {
        res.status(result.status || 200).json({
          success: true,
          data: result.data,
          responseTime: result.responseTime
        });
      } else {
        // Dispositivos offline devem retornar status 200, não 500
        const statusCode = result.code === 'DEVICE_OFFLINE' ? 200 : (result.status || 500);
        
        res.status(statusCode).json({
          success: false,
          error: result.error,
          code: result.code,
          responseTime: result.responseTime
        });
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('Erro no proxy seguro MikroTik:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR',
        responseTime
      });
    }
  }
);

// Rota para testar conexão com MikroTik de forma segura
router.get('/:mikrotikId/test', 
  authenticateByUserSession,
  userRateLimit,
  async (req, res) => {
    try {
      const { mikrotikId } = req.params;

      logger.info(`Teste de conexão seguro para MikroTik ${mikrotikId}`, {
        userId: req.user.id,
        userEmail: req.user.email
      });

      // Verificar cache primeiro
      const cachedOffline = metricsCollector.isDeviceCachedOffline(req.mikrotik);
      if (cachedOffline) {
        return res.json({
          success: false,
          error: 'MikroTik offline (cached)',
          code: 'DEVICE_OFFLINE',
          cached: true,
          cacheExpiresIn: Math.max(0, metricsCollector.metrics.offlineCacheDuration - (Date.now() - cachedOffline.timestamp))
        });
      }

      const result = await mikrotikService.testConnection(req.mikrotik);

      res.json(result);
    } catch (error) {
      logger.error(`Erro no teste de conexão seguro para ${req.params.mikrotikId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Erro interno no teste de conexão',
        code: 'TEST_ERROR'
      });
    }
  }
);

// Rota para listar MikroTiks do usuário
router.get('/list', 
  authenticateByUserSession,
  async (req, res) => {
    try {
      logger.info(`Listando MikroTiks do usuário`, {
        userId: req.user.id,
        userEmail: req.user.email
      });

      const { data: mikrotiks, error } = await supabaseService.supabase
        .from('mikrotiks')
        .select('id, nome, ip, ativo, created_at')
        .eq('user_id', req.user.id)
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;

      res.json({
        success: true,
        data: mikrotiks,
        count: mikrotiks.length
      });
    } catch (error) {
      logger.error('Erro ao listar MikroTiks do usuário:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar MikroTiks',
        code: 'LIST_ERROR'
      });
    }
  }
);

module.exports = router;