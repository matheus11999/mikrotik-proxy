const axios = require('axios');

// Configurações
const API_BASE_URL = 'http://localhost:3001';
const MIKROTIK_ID = '07d822ff-86fd-4988-8120-c6dc28de79fd'; // ID do Helio da sua tabela
const MIKROTIK_TOKEN = '882f38a2-ad13-4a60-a298-4e732750a807'; // Token do Helio

// Cliente de teste para demonstrar como usar a API
class MikrotikProxyClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // Método para fazer requisições com tratamento de erro
  async makeRequest(config) {
    try {
      const response = await this.client(config);
      return response.data;
    } catch (error) {
      if (error.response) {
        console.error(`❌ Erro ${error.response.status}:`, error.response.data);
        throw error.response.data;
      } else {
        console.error('❌ Erro de rede:', error.message);
        throw { error: error.message, code: 'NETWORK_ERROR' };
      }
    }
  }

  // Health check
  async healthCheck() {
    console.log('🏥 Verificando saúde da API...');
    const result = await this.makeRequest({ 
      url: '/health/detailed',
      method: 'GET'
    });
    console.log('✅ API está saudável:', result);
    return result;
  }

  // Testar conexão com MikroTik específico
  async testMikrotikConnection(mikrotikId, token) {
    console.log(`🔗 Testando conexão com MikroTik ${mikrotikId}...`);
    const result = await this.makeRequest({
      url: `/api/mikrotik/${mikrotikId}/test`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log('✅ Conexão testada:', result);
    return result;
  }

  // Função auxiliar para requisições autenticadas
  async makeAuthenticatedRequest(mikrotikId, token, endpoint, method = 'GET', data = null) {
    const config = {
      url: `/api/mikrotik/${mikrotikId}${endpoint}`,
      method,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      config.data = data;
    }

    return await this.makeRequest(config);
  }

  // Listar interfaces
  async getInterfaces(mikrotikId, token) {
    console.log(`📡 Obtendo interfaces do MikroTik ${mikrotikId}...`);
    const result = await this.makeAuthenticatedRequest(mikrotikId, token, '/interfaces');
    console.log('✅ Interfaces obtidas:', result.data?.length, 'interfaces');
    return result;
  }

  // Listar usuários hotspot
  async getHotspotUsers(mikrotikId) {
    console.log(`👥 Obtendo usuários hotspot do MikroTik ${mikrotikId}...`);
    const result = await this.makeRequest({
      url: `/api/mikrotik/${mikrotikId}/hotspot/users`,
      method: 'GET',
      headers: {
        'X-MikroTik-ID': mikrotikId
      }
    });
    console.log('✅ Usuários obtidos:', result.data?.length, 'usuários');
    return result;
  }

  // Obter recursos do sistema
  async getSystemResources(mikrotikId) {
    console.log(`📊 Obtendo recursos do sistema do MikroTik ${mikrotikId}...`);
    const result = await this.makeRequest({
      url: `/api/mikrotik/${mikrotikId}/system/resource`,
      method: 'GET',
      headers: {
        'X-MikroTik-ID': mikrotikId
      }
    });
    console.log('✅ Recursos do sistema:', result);
    return result;
  }

  // Fazer requisição genérica para API REST
  async makeGenericRequest(mikrotikId, endpoint, method = 'GET', data = null) {
    console.log(`🔄 Fazendo requisição ${method} para ${endpoint}...`);
    
    const config = {
      url: `/api/mikrotik/${mikrotikId}/rest${endpoint}`,
      method,
      headers: {
        'X-MikroTik-ID': mikrotikId
      }
    };

    if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      config.data = data;
    }

    const result = await this.makeRequest(config);
    console.log('✅ Requisição genérica realizada:', result);
    return result;
  }

  // Criar usuário hotspot (exemplo)
  async createHotspotUser(mikrotikId, userData) {
    console.log(`➕ Criando usuário hotspot: ${userData.name}...`);
    const result = await this.makeRequest({
      url: `/api/mikrotik/${mikrotikId}/hotspot/users`,
      method: 'POST',
      headers: {
        'X-MikroTik-ID': mikrotikId
      },
      data: userData
    });
    console.log('✅ Usuário criado:', result);
    return result;
  }

  // Listar todos os MikroTiks
  async listMikrotiks() {
    console.log('📋 Listando MikroTiks disponíveis...');
    const result = await this.makeRequest({
      url: '/api/mikrotik/list',
      method: 'GET'
    });
    console.log('✅ MikroTiks listados:', result.count, 'dispositivos');
    return result;
  }
}

// Função de teste principal
async function runTests() {
  console.log('🚀 Iniciando testes do MikroTik Proxy API\n');
  
  const client = new MikrotikProxyClient();

  try {
    // 1. Health check
    await client.healthCheck();
    console.log('');

    // 2. Listar MikroTiks disponíveis
    await client.listMikrotiks();
    console.log('');

    // 3. Testar conexão com MikroTik específico
    await client.testMikrotikConnection(MIKROTIK_ID, MIKROTIK_TOKEN);
    console.log('');

    // 4. Obter recursos do sistema
    await client.getSystemResources(MIKROTIK_ID, MIKROTIK_TOKEN);
    console.log('');

    // 5. Listar interfaces
    await client.getInterfaces(MIKROTIK_ID, MIKROTIK_TOKEN);
    console.log('');

    // 6. Listar usuários hotspot
    await client.getHotspotUsers(MIKROTIK_ID, MIKROTIK_TOKEN);
    console.log('');

    // 7. Exemplo de requisição genérica
    await client.makeGenericRequest(MIKROTIK_ID, MIKROTIK_TOKEN, '/system/identity');
    console.log('');

    // 8. Exemplo de criação de usuário (descomente se quiser testar)
    /*
    await client.createHotspotUser(MIKROTIK_ID, {
      name: 'teste-api',
      password: '123456',
      profile: 'default'
    });
    */

    console.log('🎉 Todos os testes concluídos com sucesso!');

  } catch (error) {
    console.error('💥 Erro durante os testes:', error);
    process.exit(1);
  }
}

// Executar testes se chamado diretamente
if (require.main === module) {
  runTests();
}

module.exports = MikrotikProxyClient;