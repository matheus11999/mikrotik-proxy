const axios = require('axios');

// Configurações do teste
const BASE_URL = 'http://router.mikropix.online:3001';
const MIKROTIK_ID = 'ad8ba643-627d-4539-a6ef-e6636ee0773b';

// Token de teste (substitua pelo token real do usuário)
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzM3MTM5NzM3LCJpYXQiOjE3MzcxMzYxMzcsInN1YiI6IjQwMzY3NGI2LWI3NzItNDdiZC1iNGNkLWZkNzU5YjNkMDY4NiIsImVtYWlsIjoiaG9zdHBpeEBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTczNzEzNjEzN31dLCJzZXNzaW9uX2lkIjoiMzk0NzNiNTUtNzk1My00ZjE3LTk3NjEtNGM0NDc2ZTE1Y2YzIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.qiXZYZJdyHPNQkdVUfWayGz5wkIEWYj6NzAHLKwQN0s';

async function testCreateScheduler() {
  console.log('🧪 Testando criação de scheduler no MikroTik...\n');
  
  try {
    // Dados do scheduler para teste
    const schedulerData = {
      name: 'teste-scheduler-' + Date.now(),
      start_date: 'jan/01/2025',
      start_time: '00:00:00',
      interval: '1d',
      on_event: ':log info "Scheduler de teste executado via API"',
      policy: 'read,write,policy,test',
      disabled: false,
      comment: 'Scheduler de teste criado via API'
    };

    console.log('📋 Dados do scheduler:');
    console.log(JSON.stringify(schedulerData, null, 2));
    console.log('\n⏳ Enviando requisição...\n');

    const response = await axios.post(
      `${BASE_URL}/api/mikrotik/${MIKROTIK_ID}/scheduler`,
      schedulerData,
      {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('✅ Resposta recebida:');
    console.log(`Status: ${response.status}`);
    console.log(`Headers: ${JSON.stringify(response.headers, null, 2)}`);
    console.log(`Data: ${JSON.stringify(response.data, null, 2)}`);

    if (response.data.success) {
      console.log('\n🎉 Scheduler criado com sucesso!');
      console.log(`📊 Tempo de resposta: ${response.data.responseTime}ms`);
      
      if (response.data.data) {
        console.log('📄 Dados do scheduler criado:');
        console.log(JSON.stringify(response.data.data, null, 2));
      }
    } else {
      console.log('\n❌ Falha ao criar scheduler:');
      console.log(`Erro: ${response.data.error}`);
      console.log(`Código: ${response.data.code}`);
    }

  } catch (error) {
    console.error('❌ Erro durante o teste:');
    
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
      console.log(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.request) {
      console.log('Erro de rede/timeout:');
      console.log(error.message);
    } else {
      console.log('Erro desconhecido:');
      console.log(error.message);
    }
  }
}

// Teste adicional para listar schedulers existentes
async function testListSchedulers() {
  console.log('\n🔍 Testando listagem de schedulers existentes...\n');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/api/mikrotik/${MIKROTIK_ID}/rest/system/scheduler`,
      {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('✅ Resposta recebida:');
    console.log(`Status: ${response.status}`);
    console.log(`Data: ${JSON.stringify(response.data, null, 2)}`);

    if (response.data.success && response.data.data) {
      console.log(`\n📋 Encontrados ${response.data.data.length} schedulers:`);
      response.data.data.forEach((scheduler, index) => {
        console.log(`${index + 1}. ${scheduler.name} - ${scheduler['start-date']} ${scheduler['start-time']}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro ao listar schedulers:');
    
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(error.message);
    }
  }
}

// Executar testes
async function runTests() {
  console.log('🚀 Iniciando testes do endpoint de scheduler\n');
  console.log('=' .repeat(50));
  
  // Primeiro listar schedulers existentes
  await testListSchedulers();
  
  console.log('\n' + '=' .repeat(50));
  
  // Depois criar um novo scheduler
  await testCreateScheduler();
  
  console.log('\n' + '=' .repeat(50));
  
  // Listar novamente para verificar se foi criado
  await testListSchedulers();
  
  console.log('\n✅ Testes concluídos!');
}

// Executar
runTests().catch(console.error);