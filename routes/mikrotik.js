const express = require('express');
const router = express.Router();
const mikrotikService = require('../services/mikrotikService');
const supabaseService = require('../services/supabaseService');
const { authenticateByToken, authenticateByBearerToken, validateRequest, rateLimitByMikrotik } = require('../middleware/auth');
const { metricsCollector } = require('../middleware/metrics');
const logger = require('../utils/logger');

// Rate limiting específico para MikroTik baseado no .env
const mikrotikRateLimit = rateLimitByMikrotik(
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30, 
  parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000
);

// Rota para fazer requisições genéricas para a API REST do MikroTik
router.all('/:mikrotikId/rest/*', 
  authenticateByBearerToken,
  mikrotikRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;
      const endpoint = '/' + req.params[0]; // Captura tudo após /rest/
      const method = req.method;
      const data = ['POST', 'PUT', 'PATCH'].includes(method) ? req.body : null;

      logger.info(`Proxy request to MikroTik`, {
        mikrotikId,
        endpoint,
        method,
        hasData: !!data
      });

      // Verificar se dispositivo está em cache como offline
      const cachedOffline = metricsCollector.isDeviceCachedOffline(req.mikrotik);
      if (cachedOffline) {
        logger.info(`MikroTik ${req.mikrotik.nome} está em cache como offline`, {
          cacheExpiresIn: cachedOffline.cacheExpiresIn,
          mikrotikId
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
      logger.error('Erro no proxy MikroTik:', error);
      
      await supabaseService.logApiAccess(req.params.mikrotikId, req.params[0], req.method, false, responseTime);
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do proxy',
        code: 'PROXY_ERROR'
      });
    }
  }
);

// Rota para testar conexão com MikroTik
router.get('/:mikrotikId/test', 
  authenticateByBearerToken,
  async (req, res) => {
    try {
      const result = await mikrotikService.testConnection(req.mikrotik);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Conexão estabelecida com sucesso',
          identity: result.identity,
          responseTime: result.responseTime
        });
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Erro ao testar conexão:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno ao testar conexão',
        code: 'TEST_ERROR'
      });
    }
  }
);

// Rotas específicas para endpoints comuns (com URLs mais simples)

// Interfaces
router.get('/:mikrotikId/interfaces', 
  authenticateByBearerToken,
  mikrotikRateLimit,
  async (req, res) => {
    try {
      const result = await mikrotikService.getInterfaces(req.mikrotik);
      
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(result.status || 500).json(result);
      }
    } catch (error) {
      logger.error('Erro ao obter interfaces:', error);
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }
);

// Usuários Hotspot
router.get('/:mikrotikId/hotspot/users', 
  authenticateByBearerToken,
  mikrotikRateLimit,
  async (req, res) => {
    try {
      const result = await mikrotikService.getHotspotUsers(req.mikrotik);
      
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(result.status || 500).json(result);
      }
    } catch (error) {
      logger.error('Erro ao obter usuários hotspot:', error);
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }
);

router.post('/:mikrotikId/hotspot/users', 
  authenticateByBearerToken,
  mikrotikRateLimit,
  validateRequest(['name']),
  async (req, res) => {
    try {
      const result = await mikrotikService.addHotspotUser(req.mikrotik, req.body);
      
      if (result.success) {
        res.status(201).json({ success: true, data: result.data });
      } else {
        res.status(result.status || 500).json(result);
      }
    } catch (error) {
      logger.error('Erro ao criar usuário hotspot:', error);
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }
);

// Usuários ativos no Hotspot
router.get('/:mikrotikId/hotspot/active', 
  authenticateByBearerToken,
  mikrotikRateLimit,
  async (req, res) => {
    try {
      const result = await mikrotikService.getHotspotActive(req.mikrotik);
      
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(result.status || 500).json(result);
      }
    } catch (error) {
      logger.error('Erro ao obter usuários ativos:', error);
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }
);

// Recursos do sistema
router.get('/:mikrotikId/system/resource', 
  authenticateByBearerToken,
  mikrotikRateLimit,
  async (req, res) => {
    try {
      const result = await mikrotikService.getSystemResources(req.mikrotik);
      
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(result.status || 500).json(result);
      }
    } catch (error) {
      logger.error('Erro ao obter recursos do sistema:', error);
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }
);

// Lista de endereços do firewall
router.get('/:mikrotikId/firewall/address-list', 
  authenticateByBearerToken,
  mikrotikRateLimit,
  async (req, res) => {
    try {
      const result = await mikrotikService.getFirewallAddressList(req.mikrotik);
      
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(result.status || 500).json(result);
      }
    } catch (error) {
      logger.error('Erro ao obter address-list:', error);
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }
);

router.post('/:mikrotikId/firewall/address-list', 
  authenticateByBearerToken,
  mikrotikRateLimit,
  validateRequest(['address', 'list']),
  async (req, res) => {
    try {
      const result = await mikrotikService.addFirewallAddressList(req.mikrotik, req.body);
      
      if (result.success) {
        res.status(201).json({ success: true, data: result.data });
      } else {
        res.status(result.status || 500).json(result);
      }
    } catch (error) {
      logger.error('Erro ao adicionar address-list:', error);
      res.status(500).json({ success: false, error: 'Erro interno' });
    }
  }
);

// Rota para listar todos os MikroTiks ativos (admin)
router.get('/list', async (req, res) => {
  try {
    const mikrotiks = await supabaseService.getAllActiveMikrotiks();
    
    // Remover informações sensíveis
    const safeMikrotiks = mikrotiks.map(mt => ({
      id: mt.id,
      nome: mt.nome,
      ip: mt.ip,
      port: mt.port
    }));
    
    res.json({
      success: true,
      data: safeMikrotiks,
      count: safeMikrotiks.length
    });
  } catch (error) {
    logger.error('Erro ao listar MikroTiks:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao listar MikroTiks'
    });
  }
});

module.exports = router;