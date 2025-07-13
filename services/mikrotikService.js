const axios = require('axios');
const logger = require('../utils/logger');

class MikrotikService {
  constructor() {
    this.timeout = parseInt(process.env.MIKROTIK_TIMEOUT) || 10000;
    this.activeConnections = new Map();
  }

  async makeRequest(mikrotikConfig, endpoint, method = 'GET', data = null) {
    const { ip, username, password } = mikrotikConfig;
    
    // API REST sempre usa porta 80 (HTTP)
    const baseURL = `http://${ip}:80`;
    const fullURL = `${baseURL}/rest${endpoint}`;

    const startTime = Date.now();
    
    try {
      // Configuração do axios para esta requisição
      const config = {
        method: method.toLowerCase(),
        url: fullURL,
        timeout: this.timeout,
        auth: {
          username,
          password
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        validateStatus: (status) => {
          // Aceitar códigos de status do MikroTik
          return status >= 200 && status < 500;
        }
      };

      if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        config.data = data;
      }

      logger.info(`MikroTik API Request`, {
        mikrotik: ip,
        method,
        endpoint,
        hasData: !!data
      });

      const response = await axios(config);
      const responseTime = Date.now() - startTime;

      logger.info(`MikroTik API Response`, {
        mikrotik: ip,
        method,
        endpoint,
        status: response.status,
        responseTime: `${responseTime}ms`
      });

      return {
        success: true,
        status: response.status,
        data: response.data,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Análise detalhada do tipo de erro
      if (error.code === 'ECONNREFUSED') {
        logger.error(`MikroTik offline (conexão recusada): ${ip}:80`);
        return {
          success: false,
          error: 'MikroTik offline',
          code: 'DEVICE_OFFLINE',
          responseTime,
          details: 'Dispositivo não está respondendo na porta 80'
        };
      }

      if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
        logger.error(`MikroTik inacessível: ${ip}:80 - ${error.code}`);
        return {
          success: false,
          error: 'MikroTik offline',
          code: 'DEVICE_OFFLINE',
          responseTime,
          details: 'Timeout ou IP não encontrado'
        };
      }

      if (error.code === 'ECONNABORTED') {
        logger.error(`Timeout de requisição: ${ip}:80`);
        return {
          success: false,
          error: 'MikroTik offline',
          code: 'DEVICE_OFFLINE',
          responseTime,
          details: 'Dispositivo não respondeu no tempo limite'
        };
      }

      if (error.response) {
        const status = error.response.status;
        
        // Análise específica por código HTTP
        if (status === 401) {
          logger.warn(`Credenciais inválidas para MikroTik: ${ip}:80`);
          return {
            success: false,
            status: 401,
            error: 'Usuário ou senha incorretos',
            code: 'INVALID_CREDENTIALS',
            responseTime,
            details: 'Verificar username e password do MikroTik'
          };
        }

        if (status === 403) {
          logger.warn(`Acesso negado para MikroTik: ${ip}:80`);
          return {
            success: false,
            status: 403,
            error: 'Acesso negado',
            code: 'ACCESS_DENIED',
            responseTime,
            details: 'Usuário não tem permissões suficientes'
          };
        }

        if (status === 404) {
          logger.warn(`Endpoint não encontrado: ${ip}:80${endpoint}`);
          return {
            success: false,
            status: 404,
            error: 'Recurso não encontrado',
            code: 'ENDPOINT_NOT_FOUND',
            responseTime,
            details: 'API REST pode não estar habilitada'
          };
        }

        if (status >= 500) {
          logger.error(`Erro interno do MikroTik: ${ip}:80 - Status ${status}`);
          return {
            success: false,
            status: status,
            error: 'Erro interno do MikroTik',
            code: 'MIKROTIK_ERROR',
            responseTime,
            details: error.response.data || 'Erro no RouterOS'
          };
        }

        // Outros erros HTTP
        logger.warn(`MikroTik API Error`, {
          mikrotik: ip,
          method,
          endpoint,
          status: status,
          error: error.response.data,
          responseTime: `${responseTime}ms`
        });

        return {
          success: false,
          status: status,
          error: error.response.data || 'Erro na API do MikroTik',
          code: 'MIKROTIK_API_ERROR',
          responseTime
        };
      }

      // Outros erros de rede/conexão
      logger.error(`Erro de rede com MikroTik: ${ip}:80`, {
        error: error.message,
        code: error.code,
        responseTime: `${responseTime}ms`
      });

      return {
        success: false,
        error: 'MikroTik offline',
        code: 'DEVICE_OFFLINE',
        responseTime,
        details: error.message
      };
    }
  }

  async quickConnectivityTest(mikrotikConfig) {
    const { ip } = mikrotikConfig;
    const startTime = Date.now();
    
    try {
      // Teste rápido com timeout de 3 segundos
      const response = await axios.get(`http://${ip}:80/rest/system/clock`, {
        timeout: 3000,
        auth: {
          username: mikrotikConfig.username,
          password: mikrotikConfig.password
        },
        validateStatus: (status) => status >= 200 && status < 500
      });
      
      const responseTime = Date.now() - startTime;
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'Usuário ou senha incorretos',
          code: 'INVALID_CREDENTIALS',
          responseTime
        };
      }
      
      return {
        success: true,
        responseTime,
        status: response.status
      };
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error.response?.status === 401) {
        return {
          success: false,
          error: 'Usuário ou senha incorretos',
          code: 'INVALID_CREDENTIALS',
          responseTime
        };
      }
      
      return {
        success: false,
        error: 'MikroTik offline',
        code: 'DEVICE_OFFLINE',
        responseTime
      };
    }
  }

  async testConnection(mikrotikConfig) {
    try {
      // Primeiro faz teste rápido de conectividade
      const quickTest = await this.quickConnectivityTest(mikrotikConfig);
      
      if (!quickTest.success) {
        return quickTest;
      }
      
      // Se passou no teste rápido, faz teste completo
      const result = await this.makeRequest(mikrotikConfig, '/system/identity', 'GET');
      
      if (result.success) {
        logger.info(`Conexão testada com sucesso: ${mikrotikConfig.ip}`);
        return {
          success: true,
          identity: result.data,
          responseTime: result.responseTime
        };
      }

      return result;
    } catch (error) {
      logger.error(`Erro ao testar conexão com ${mikrotikConfig.ip}:`, error);
      return {
        success: false,
        error: error.message,
        code: 'TEST_CONNECTION_FAILED'
      };
    }
  }

  // Métodos específicos para endpoints comuns
  async getInterfaces(mikrotikConfig) {
    return await this.makeRequest(mikrotikConfig, '/interface');
  }

  async getHotspotUsers(mikrotikConfig) {
    return await this.makeRequest(mikrotikConfig, '/ip/hotspot/user');
  }

  async addHotspotUser(mikrotikConfig, userData) {
    return await this.makeRequest(mikrotikConfig, '/ip/hotspot/user', 'POST', userData);
  }

  async updateHotspotUser(mikrotikConfig, userId, userData) {
    return await this.makeRequest(mikrotikConfig, `/ip/hotspot/user/${userId}`, 'PUT', userData);
  }

  async deleteHotspotUser(mikrotikConfig, userId) {
    return await this.makeRequest(mikrotikConfig, `/ip/hotspot/user/${userId}`, 'DELETE');
  }

  async getHotspotActive(mikrotikConfig) {
    return await this.makeRequest(mikrotikConfig, '/ip/hotspot/active');
  }

  async getSystemResources(mikrotikConfig) {
    return await this.makeRequest(mikrotikConfig, '/system/resource');
  }

  async getSystemRouterboard(mikrotikConfig) {
    return await this.makeRequest(mikrotikConfig, '/system/routerboard');
  }

  async getFirewallAddressList(mikrotikConfig) {
    return await this.makeRequest(mikrotikConfig, '/ip/firewall/address-list');
  }

  async addFirewallAddressList(mikrotikConfig, addressData) {
    return await this.makeRequest(mikrotikConfig, '/ip/firewall/address-list', 'POST', addressData);
  }

  async removeFirewallAddressList(mikrotikConfig, addressId) {
    return await this.makeRequest(mikrotikConfig, `/ip/firewall/address-list/${addressId}`, 'DELETE');
  }
}

module.exports = new MikrotikService();