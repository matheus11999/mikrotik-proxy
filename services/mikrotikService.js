const axios = require('axios');
const logger = require('../utils/logger');

class MikrotikService {
  constructor() {
    this.timeout = parseInt(process.env.MIKROTIK_TIMEOUT) || 10000;
    this.activeConnections = new Map();
  }

  async makeRequest(mikrotikConfig, endpoint, method = 'GET', data = null) {
    const { ip, username, password, port } = mikrotikConfig;
    const baseURL = `http://${ip}:${port || 80}`;
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
      
      if (error.code === 'ECONNREFUSED') {
        logger.error(`MikroTik não acessível: ${ip}:${port}`);
        return {
          success: false,
          error: 'MikroTik não acessível',
          code: 'CONNECTION_REFUSED',
          responseTime
        };
      }

      if (error.code === 'ETIMEDOUT') {
        logger.error(`Timeout na conexão com MikroTik: ${ip}:${port}`);
        return {
          success: false,
          error: 'Timeout na conexão',
          code: 'TIMEOUT',
          responseTime
        };
      }

      if (error.response) {
        // Erro HTTP do MikroTik
        logger.warn(`MikroTik API Error`, {
          mikrotik: ip,
          method,
          endpoint,
          status: error.response.status,
          error: error.response.data,
          responseTime: `${responseTime}ms`
        });

        return {
          success: false,
          status: error.response.status,
          error: error.response.data || 'Erro na API do MikroTik',
          code: 'MIKROTIK_API_ERROR',
          responseTime
        };
      }

      // Outros erros
      logger.error(`Erro desconhecido na requisição MikroTik`, {
        mikrotik: ip,
        method,
        endpoint,
        error: error.message,
        responseTime: `${responseTime}ms`
      });

      return {
        success: false,
        error: error.message || 'Erro desconhecido',
        code: 'UNKNOWN_ERROR',
        responseTime
      };
    }
  }

  async testConnection(mikrotikConfig) {
    try {
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