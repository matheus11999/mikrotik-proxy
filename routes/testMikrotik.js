const express = require('express');
const router = express.Router();
const mikrotikService = require('../services/mikrotikService');
const supabaseService = require('../services/supabaseService');
const logger = require('../utils/logger');

/**
 * 🧪 ROTA DE TESTE PARA ENDPOINTS MIKROTIK
 * 
 * Esta rota permite testar endpoints MikroTik sem autenticação completa de usuário.
 * Usa um token especial de teste: "TEST_TOKEN_MIKROTIK_2024"
 * 
 * USO: Para debugging e desenvolvimento apenas!
 */

// Middleware de autenticação simplificada para testes
const authenticateTestToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de autorização necessário',
        code: 'MISSING_AUTH_HEADER'
      });
    }

    const token = authHeader.substring(7);
    
    // Token especial para testes
    if (token === 'TEST_TOKEN_MIKROTIK_2024') {
      // Para testes, usar um usuário fake mas buscar MikroTik real
      req.user = {
        id: 'test-user',
        email: 'test@mikropix.com'
      };
      
      const { mikrotikId } = req.params;
      
      if (!mikrotikId) {
        return res.status(400).json({
          success: false,
          error: 'MikroTik ID necessário',
          code: 'MISSING_MIKROTIK_ID'
        });
      }

      try {
        // Buscar credenciais do MikroTik no Supabase (sem verificar ownership para teste)
        const mikrotik = await supabaseService.getMikrotikCredentials(mikrotikId);
        
        if (!mikrotik) {
          return res.status(404).json({
            success: false,
            error: 'MikroTik não encontrado',
            code: 'MIKROTIK_NOT_FOUND'
          });
        }

        req.mikrotik = mikrotik;
        
        logger.info(`🧪 [TEST] Acesso de teste ao MikroTik ${mikrotikId}`, {
          mikrotikName: mikrotik.nome,
          mikrotikIp: mikrotik.ip
        });
        
        next();
      } catch (error) {
        logger.error('🧪 [TEST] Erro ao buscar MikroTik:', error);
        return res.status(500).json({
          success: false,
          error: 'Erro ao buscar MikroTik',
          code: 'MIKROTIK_FETCH_ERROR'
        });
      }
    } else {
      return res.status(401).json({
        success: false,
        error: 'Token de teste inválido',
        code: 'INVALID_TEST_TOKEN'
      });
    }
  } catch (error) {
    logger.error('🧪 [TEST] Erro na autenticação de teste:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno na autenticação',
      code: 'AUTH_INTERNAL_ERROR'
    });
  }
};

// Rota genérica de teste para qualquer endpoint REST do MikroTik
router.all('/:mikrotikId/rest/*', 
  authenticateTestToken,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;
      const endpoint = '/' + req.params[0]; // Captura tudo após /rest/
      const method = req.method;
      const data = ['POST', 'PUT', 'PATCH'].includes(method) ? req.body : null;

      logger.info(`🧪 [TEST] Requisição de teste para MikroTik`, {
        mikrotikId,
        endpoint,
        method,
        hasData: !!data,
        testUser: req.user.email
      });

      // Fazer a requisição para o MikroTik
      const result = await mikrotikService.makeRequest(req.mikrotik, endpoint, method, data);
      const responseTime = Date.now() - startTime;

      // Headers de debug
      res.set({
        'X-Response-Time': `${responseTime}ms`,
        'X-Test-Mode': 'true',
        'X-MikroTik-Id': mikrotikId,
        'X-Endpoint-Tested': endpoint
      });

      if (result.success) {
        res.status(result.status || 200).json({
          success: true,
          data: result.data,
          responseTime: result.responseTime,
          testInfo: {
            endpoint,
            method,
            mikrotikId,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        const statusCode = result.code === 'DEVICE_OFFLINE' ? 200 : (result.status || 500);
        
        res.status(statusCode).json({
          success: false,
          error: result.error,
          code: result.code,
          responseTime: result.responseTime,
          testInfo: {
            endpoint,
            method,
            mikrotikId,
            timestamp: new Date().toISOString()
          }
        });
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('🧪 [TEST] Erro na requisição de teste:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor de teste',
        code: 'TEST_INTERNAL_ERROR',
        responseTime,
        testInfo: {
          mikrotikId: req.params.mikrotikId,
          timestamp: new Date().toISOString()
        }
      });
    }
  }
);

// Rota de teste de conectividade simples
router.get('/:mikrotikId/test-connection', 
  authenticateTestToken,
  async (req, res) => {
    try {
      const { mikrotikId } = req.params;

      logger.info(`🧪 [TEST] Teste de conectividade para MikroTik ${mikrotikId}`);

      const result = await mikrotikService.testConnection(req.mikrotik);

      res.json({
        ...result,
        testInfo: {
          mikrotikId,
          mikrotikName: req.mikrotik.nome,
          mikrotikIp: req.mikrotik.ip,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error(`🧪 [TEST] Erro no teste de conectividade para ${req.params.mikrotikId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Erro interno no teste de conectividade',
        code: 'TEST_CONNECTION_ERROR'
      });
    }
  }
);

// Rota para listar todos os MikroTiks disponíveis para teste
router.get('/list-available', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.substring(7);
  
  if (token !== 'TEST_TOKEN_MIKROTIK_2024') {
    return res.status(401).json({
      success: false,
      error: 'Token de teste necessário',
      code: 'INVALID_TEST_TOKEN'
    });
  }

  try {
    logger.info('🧪 [TEST] Listando MikroTiks disponíveis para teste');

    const { data: mikrotiks, error } = await supabaseService.supabase
      .from('mikrotiks')
      .select('id, nome, ip, ativo')
      .eq('ativo', true)
      .order('nome');

    if (error) throw error;

    res.json({
      success: true,
      data: mikrotiks,
      count: mikrotiks.length,
      testInfo: {
        message: 'Use qualquer um destes IDs para testar endpoints',
        tokenRequired: 'TEST_TOKEN_MIKROTIK_2024',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('🧪 [TEST] Erro ao listar MikroTiks:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar MikroTiks',
      code: 'LIST_ERROR'
    });
  }
});

module.exports = router;