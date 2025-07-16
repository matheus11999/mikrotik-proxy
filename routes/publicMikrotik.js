const express = require('express');
const router = express.Router();
const mikrotikService = require('../services/mikrotikService');
const supabaseService = require('../services/supabaseService');
const { rateLimitByIP } = require('../middleware/secureAuth');
const logger = require('../utils/logger');

// Rate limiting para rotas públicas (mais restritivo)
const publicRateLimit = rateLimitByIP(50, 60000); // 50 req/min por IP

// Rota pública para verificar se voucher/hotspot user existe (sem autenticação)
router.post('/check-voucher/:mikrotikId', 
  publicRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;
      const { username } = req.body;

      logger.info(`[PUBLIC] Verificando voucher: ${username} no MikroTik: ${mikrotikId}`);

      // Validar campos obrigatórios
      if (!username || !mikrotikId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'username and mikrotikId are required'
        });
      }

      // Buscar dados do MikroTik no Supabase
      const { data: mikrotik, error: mikrotikError } = await supabaseService.supabase
        .from('mikrotiks')
        .select('id, ip, username, password, port, ativo')
        .eq('id', mikrotikId)
        .eq('ativo', true)
        .single();

      if (mikrotikError || !mikrotik) {
        logger.error(`[PUBLIC] MikroTik não encontrado: ${mikrotikId}`);
        return res.status(404).json({
          success: false,
          error: 'MikroTik not found',
          message: 'The specified MikroTik was not found or is not active'
        });
      }

      // Configurar credenciais do MikroTik
      const mikrotikConfig = {
        id: mikrotik.id,
        ip: mikrotik.ip,
        username: mikrotik.username,
        password: mikrotik.password,
        port: mikrotik.port || 8728
      };

      // Buscar usuário hotspot usando a REST API do MikroTik
      const endpoint = `/ip/hotspot/user?name=${encodeURIComponent(username)}`;
      const result = await mikrotikService.makeRequest(mikrotikConfig, endpoint, 'GET');
      
      const responseTime = Date.now() - startTime;

      if (!result.success) {
        return res.status(200).json({
          success: false,
          error: result.error,
          code: result.code,
          responseTime
        });
      }

      // Verificar se usuário existe
      const users = result.data || [];
      const user = users.find(u => u.name === username);

      if (!user) {
        return res.status(200).json({
          success: false,
          exists: false,
          message: 'Voucher não encontrado',
          responseTime
        });
      }

      // Verificar uptime para determinar se foi usado
      const uptimeZerado = !user.uptime || user.uptime === "00:00:00";
      
      res.json({
        success: true,
        exists: true,
        used: !uptimeZerado,
        user: {
          name: user.name,
          profile: user.profile,
          comment: user.comment,
          uptime: user.uptime,
          disabled: user.disabled
        },
        responseTime
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('[PUBLIC] Erro ao verificar voucher:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR',
        responseTime
      });
    }
  }
);

// Rota pública para criar usuário hotspot (sem autenticação)
router.post('/create-hotspot-user/:mikrotikId',
  publicRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;
      const { name, password, profile, comment } = req.body;

      logger.info(`[PUBLIC] Criando usuário hotspot: ${name} no MikroTik: ${mikrotikId}`);

      // Validar campos obrigatórios
      if (!name || !password || !mikrotikId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'name, password and mikrotikId are required'
        });
      }

      // Buscar dados do MikroTik
      const { data: mikrotik, error: mikrotikError } = await supabaseService.supabase
        .from('mikrotiks')
        .select('id, ip, username, password, port, ativo')
        .eq('id', mikrotikId)
        .eq('ativo', true)
        .single();

      if (mikrotikError || !mikrotik) {
        return res.status(404).json({
          success: false,
          error: 'MikroTik not found',
          message: 'The specified MikroTik was not found or is not active'
        });
      }

      // Configurar credenciais do MikroTik
      const mikrotikConfig = {
        id: mikrotik.id,
        ip: mikrotik.ip,
        username: mikrotik.username,
        password: mikrotik.password,
        port: mikrotik.port || 8728
      };

      // Criar objeto do usuário
      const userData = {
        name,
        password,
        profile: profile || 'default'
      };

      // Adicionar comentário se fornecido
      if (comment) {
        userData.comment = comment;
      }

      // Criar usuário usando REST API
      const result = await mikrotikService.makeRequest(mikrotikConfig, '/ip/hotspot/user', 'POST', userData);
      
      const responseTime = Date.now() - startTime;

      if (!result.success) {
        return res.status(200).json({
          success: false,
          error: result.error,
          code: result.code,
          responseTime
        });
      }

      res.json({
        success: true,
        message: 'Usuário hotspot criado com sucesso',
        user: userData,
        responseTime
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('[PUBLIC] Erro ao criar usuário hotspot:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR',
        responseTime
      });
    }
  }
);

// Rota pública para criar IP binding (sem autenticação)
router.post('/create-ip-binding/:mikrotikId',
  publicRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;
      const { address, mac_address, comment } = req.body;

      logger.info(`[PUBLIC] Criando IP binding: ${address} -> ${mac_address} no MikroTik: ${mikrotikId}`);

      // Validar campos obrigatórios
      if (!address || !mac_address || !mikrotikId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'address, mac_address and mikrotikId are required'
        });
      }

      // Buscar dados do MikroTik
      const { data: mikrotik, error: mikrotikError } = await supabaseService.supabase
        .from('mikrotiks')
        .select('id, ip, username, password, port, ativo')
        .eq('id', mikrotikId)
        .eq('ativo', true)
        .single();

      if (mikrotikError || !mikrotik) {
        return res.status(404).json({
          success: false,
          error: 'MikroTik not found',
          message: 'The specified MikroTik was not found or is not active'
        });
      }

      // Configurar credenciais do MikroTik
      const mikrotikConfig = {
        id: mikrotik.id,
        ip: mikrotik.ip,
        username: mikrotik.username,
        password: mikrotik.password,
        port: mikrotik.port || 8728
      };

      // Criar objeto do IP binding
      const bindingData = {
        address,
        'mac-address': mac_address,
        disabled: 'false'
      };

      // Adicionar comentário se fornecido
      if (comment) {
        bindingData.comment = comment;
      }

      // Criar IP binding usando REST API
      const result = await mikrotikService.makeRequest(mikrotikConfig, '/ip/dhcp-server/lease', 'POST', bindingData);
      
      const responseTime = Date.now() - startTime;

      if (!result.success) {
        return res.status(200).json({
          success: false,
          error: result.error,
          code: result.code,
          responseTime
        });
      }

      res.json({
        success: true,
        message: 'IP binding criado com sucesso',
        binding: bindingData,
        responseTime
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('[PUBLIC] Erro ao criar IP binding:', error);

      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR',
        responseTime
      });
    }
  }
);

module.exports = router;