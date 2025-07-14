const axios = require('axios');

// Configuração do benchmark
const CONFIG = {
  baseURL: 'http://localhost:3001',
  concurrent: 50,
  totalRequests: 1000,
  testDuration: 30000, // 30 segundos
  userToken: 'seu_token_de_teste_aqui', // Substitua por um token válido
  mikrotikId: 'seu_mikrotik_id_aqui'    // Substitua por um MikroTik ID válido
};

class Benchmark {
  constructor() {
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: [],
      errors: {},
      startTime: null,
      endTime: null
    };
  }

  async makeRequest() {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(
        `${CONFIG.baseURL}/api/mikrotik/${CONFIG.mikrotikId}/rest/system/resource`,
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.userToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      const responseTime = Date.now() - startTime;
      this.results.responseTimes.push(responseTime);
      this.results.successfulRequests++;
      
      return { success: true, responseTime, status: response.status };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.results.failedRequests++;
      
      const errorType = error.response?.status || error.code || 'UNKNOWN';
      this.results.errors[errorType] = (this.results.errors[errorType] || 0) + 1;
      
      return { success: false, responseTime, error: errorType };
    } finally {
      this.results.totalRequests++;
    }
  }

  async runConcurrentTest() {
    console.log('🚀 Iniciando teste de concorrência...');
    console.log(`📊 Configuração: ${CONFIG.concurrent} requisições simultâneas por ${CONFIG.testDuration}ms`);
    
    this.results.startTime = Date.now();
    const endTime = this.results.startTime + CONFIG.testDuration;
    
    const workers = [];
    
    // Criar workers concorrentes
    for (let i = 0; i < CONFIG.concurrent; i++) {
      const worker = async () => {
        while (Date.now() < endTime) {
          await this.makeRequest();
          await new Promise(resolve => setTimeout(resolve, 10)); // Pequena pausa
        }
      };
      
      workers.push(worker());
    }
    
    // Aguardar todos os workers
    await Promise.all(workers);
    
    this.results.endTime = Date.now();
    this.printResults();
  }

  async runLoadTest() {
    console.log('🔥 Iniciando teste de carga...');
    console.log(`📊 Configuração: ${CONFIG.totalRequests} requisições com ${CONFIG.concurrent} simultâneas`);
    
    this.results.startTime = Date.now();
    
    const chunks = [];
    for (let i = 0; i < CONFIG.totalRequests; i += CONFIG.concurrent) {
      const chunk = [];
      const chunkSize = Math.min(CONFIG.concurrent, CONFIG.totalRequests - i);
      
      for (let j = 0; j < chunkSize; j++) {
        chunk.push(this.makeRequest());
      }
      
      chunks.push(chunk);
    }
    
    // Executar chunks sequencialmente
    for (const chunk of chunks) {
      await Promise.all(chunk);
      process.stdout.write(`\r📈 Progresso: ${this.results.totalRequests}/${CONFIG.totalRequests} requisições`);
    }
    
    console.log(); // Nova linha
    this.results.endTime = Date.now();
    this.printResults();
  }

  async testHealthEndpoints() {
    console.log('🏥 Testando endpoints de health...');
    
    const endpoints = [
      '/health',
      '/health/detailed',
      '/metrics',
      '/metrics/summary'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const response = await axios.get(`${CONFIG.baseURL}${endpoint}`, {
          headers: endpoint.startsWith('/metrics') ? {
            'X-Dashboard-Password': 'admin123'
          } : {},
          timeout: 5000
        });
        
        const responseTime = Date.now() - startTime;
        console.log(`✅ ${endpoint}: ${response.status} (${responseTime}ms)`);
      } catch (error) {
        console.log(`❌ ${endpoint}: ${error.response?.status || error.code}`);
      }
    }
  }

  printResults() {
    const duration = this.results.endTime - this.results.startTime;
    const avgResponseTime = this.results.responseTimes.reduce((a, b) => a + b, 0) / this.results.responseTimes.length;
    const requestsPerSecond = (this.results.totalRequests / duration) * 1000;
    const successRate = (this.results.successfulRequests / this.results.totalRequests) * 100;
    
    console.log('\n📊 RESULTADOS DO BENCHMARK:');
    console.log('═'.repeat(50));
    console.log(`⏱️  Duração: ${(duration / 1000).toFixed(2)}s`);
    console.log(`📈 Requisições totais: ${this.results.totalRequests}`);
    console.log(`✅ Sucessos: ${this.results.successfulRequests}`);
    console.log(`❌ Falhas: ${this.results.failedRequests}`);
    console.log(`🎯 Taxa de sucesso: ${successRate.toFixed(2)}%`);
    console.log(`⚡ Requisições/segundo: ${requestsPerSecond.toFixed(2)}`);
    console.log(`📊 Tempo médio de resposta: ${avgResponseTime.toFixed(2)}ms`);
    
    if (this.results.responseTimes.length > 0) {
      const sorted = this.results.responseTimes.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];
      
      console.log('\n🎯 PERCENTIS DE RESPOSTA:');
      console.log(`P50: ${p50}ms`);
      console.log(`P90: ${p90}ms`);
      console.log(`P95: ${p95}ms`);
      console.log(`P99: ${p99}ms`);
    }
    
    if (Object.keys(this.results.errors).length > 0) {
      console.log('\n❌ ERROS:');
      Object.entries(this.results.errors).forEach(([error, count]) => {
        console.log(`${error}: ${count}`);
      });
    }
    
    console.log('═'.repeat(50));
  }
}

async function main() {
  const benchmark = new Benchmark();
  
  // Verificar se a API está rodando
  try {
    await axios.get(`${CONFIG.baseURL}/health`);
    console.log('✅ API está online e respondendo');
  } catch (error) {
    console.error('❌ API não está respondendo. Verifique se está rodando na porta 3001');
    process.exit(1);
  }
  
  // Testar endpoints de health primeiro
  await benchmark.testHealthEndpoints();
  
  console.log('\n' + '='.repeat(50));
  console.log('Escolha o tipo de teste:');
  console.log('1. Teste de Concorrência (30s)');
  console.log('2. Teste de Carga (1000 requisições)');
  console.log('3. Ambos');
  
  const testType = process.argv[2] || '3';
  
  if (testType === '1' || testType === '3') {
    await benchmark.runConcurrentTest();
    if (testType === '3') {
      console.log('\n' + '='.repeat(50));
      benchmark.results = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        responseTimes: [],
        errors: {},
        startTime: null,
        endTime: null
      };
    }
  }
  
  if (testType === '2' || testType === '3') {
    await benchmark.runLoadTest();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = Benchmark;