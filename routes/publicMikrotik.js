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

      // Buscar TODOS os usuários hotspot e filtrar pelo nome
      const endpoint = `/ip/hotspot/user`;
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

      // Verificar se usuário existe na lista completa
      const users = result.data || [];
      
      // Debug: verificar estrutura dos dados
      logger.info(`[PUBLIC] Busca por usuário ${username}: ${users.length} usuários encontrados`);
      if (users.length > 0) {
        logger.info(`[PUBLIC] Exemplo de usuário encontrado:`, users[0]);
        logger.info(`[PUBLIC] Nomes dos primeiros 5 usuários:`, users.slice(0, 5).map(u => u.name || u['.id'] || u));
      }
      
      // Buscar por name (padrão) ou outros campos possíveis
      const user = users.find(u => 
        u.name === username || 
        u['.id'] === username || 
        u.user === username ||
        (typeof u === 'string' && u === username)
      );
      
      logger.info(`[PUBLIC] Match encontrado: ${!!user}`, user ? { name: user.name, id: user['.id'] } : null);

      if (!user) {
        return res.status(200).json({
          success: false,
          exists: false,
          message: 'Voucher não encontrado',
          responseTime,
          debug: {
            totalUsers: users.length,
            sampleUserNames: users.slice(0, 10).map(u => u.name || u['.id'] || JSON.stringify(u).substring(0, 50)),
            searchedUsername: username
          }
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

      logger.info(`[PUBLIC] Resultado da criação de usuário ${name}:`, {
        success: result.success,
        error: result.error,
        data: result.data,
        status: result.status
      });

      if (!result.success) {
        return res.status(200).json({
          success: false,
          error: result.error,
          code: result.code,
          responseTime,
          details: result.data // Adicionar detalhes para debug
        });
      }

      res.json({
        success: true,
        message: 'Usuário hotspot criado com sucesso',
        user: userData,
        mikrotikResponse: result.data, // Adicionar resposta do MikroTik
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

      // Criar objeto do IP binding do hotspot
      const bindingData = {
        address,
        'mac-address': mac_address,
        type: 'bypassed' // ou 'blocked' - bypassed permite acesso sem login
      };

      // Adicionar comentário se fornecido
      if (comment) {
        bindingData.comment = comment;
      }

      // Criar IP binding do hotspot usando REST API
      const result = await mikrotikService.makeRequest(mikrotikConfig, '/ip/hotspot/ip-binding', 'PUT', bindingData);
      
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

// Rota pública para verificar IP bindings (sem autenticação)
router.post('/check-ip-binding/:mikrotikId',
  publicRateLimit,
  async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { mikrotikId } = req.params;
      const { mac_address, address } = req.body;

      logger.info(`[PUBLIC] Verificando IP binding: ${address || 'any'} -> ${mac_address || 'any'} no MikroTik: ${mikrotikId}`);

      // Validar campos (pelo menos um deve ser fornecido)
      if (!mac_address && !address) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'mac_address or address is required'
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

      // Buscar TODOS os IP bindings do hotspot
      const endpoint = `/ip/hotspot/ip-binding`;
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

      // Verificar se binding existe na lista
      const bindings = result.data || [];
      
      // Buscar por MAC address ou IP address
      const binding = bindings.find(b => {
        const macMatch = mac_address && (b['mac-address'] === mac_address || b.address === mac_address);
        const ipMatch = address && (b.address === address || b['active-address'] === address);
        return macMatch || ipMatch;
      });
      
      logger.info(`[PUBLIC] Busca binding: ${bindings.length} bindings encontrados, match: ${!!binding}`);

      if (!binding) {
        return res.status(200).json({
          success: false,
          exists: false,
          message: 'IP binding não encontrado',
          responseTime,
          debug: {
            totalBindings: bindings.length,
            searchCriteria: { mac_address, address },
            sampleBindings: bindings.slice(0, 5).map(b => ({
              address: b.address,
              macAddress: b['mac-address'],
              comment: b.comment
            }))
          }
        });
      }

      res.json({
        success: true,
        exists: true,
        binding: {
          address: binding.address || binding['active-address'],
          macAddress: binding['mac-address'],
          comment: binding.comment,
          disabled: binding.disabled,
          dynamic: binding.dynamic,
          status: binding.status
        },
        responseTime
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error('[PUBLIC] Erro ao verificar IP binding:', error);

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