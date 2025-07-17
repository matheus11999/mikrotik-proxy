const axios = require('axios');

// Configurações do teste
const BASE_URL = 'http://router.mikropix.online:3001';
const MIKROTIK_ID = 'ad8ba643-627d-4539-a6ef-e6636ee0773b';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzM3MTM5NzM3LCJpYXQiOjE3MzcxMzYxMzcsInN1YiI6IjQwMzY3NGI2LWI3NzItNDdiZC1iNGNkLWZkNzU5YjNkMDY4NiIsImVtYWlsIjoiaG9zdHBpeEBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTczNzEzNjEzN31dLCJzZXNzaW9uX2lkIjoiMzk0NzNiNTUtNzk1My00ZjE3LTk3NjEtNGM0NDc2ZTE1Y2YzIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.qiXZYZJdyHPNQkdVUfWayGz5wkIEWYj6NzAHLKwQN0s';

async function testCreateSchedulerDirect() {
  console.log('🧪 Testando criação de scheduler usando endpoint REST genérico...\n');
  
  try {
    // Dados do scheduler para teste
    const schedulerData = {
      name: 'teste-scheduler-direct-' + Date.now(),
      'start-date': 'jan/01/2025',
      'start-time': '00:00:00',
      interval: '1d',
      'on-event': ':log info "Scheduler de teste executado"',
      policy: 'read,write,policy,test',
      disabled: 'false',
      comment: 'Scheduler de teste criado via API REST direta'
    };

    console.log('📋 Dados do scheduler:');
    console.log(JSON.stringify(schedulerData, null, 2));
    console.log('\n⏳ Enviando requisição via endpoint REST genérico...\n');

    const response = await axios.post(
      `${BASE_URL}/api/mikrotik/${MIKROTIK_ID}/rest/system/scheduler`,
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

async function testSystemClock() {
  console.log('\n🕐 Testando endpoint /system/clock para verificar API REST...\n');
  
  try {
    const response = await axios.get(
      `${BASE_URL}/api/mikrotik/${MIKROTIK_ID}/rest/system/clock`,
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

  } catch (error) {
    console.error('❌ Erro ao testar /system/clock:');
    
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(error.message);
    }
  }
}

async function testAddScheduler() {
  console.log('\n📅 Testando criação de scheduler usando método ADD...\n');
  
  try {
    // Dados do scheduler para teste
    const schedulerData = {
      name: 'teste-scheduler-add-' + Date.now(),
      'start-date': 'jan/01/2025',
      'start-time': '00:00:00',
      interval: '1d',
      'on-event': ':log info "Scheduler de teste executado"',
      policy: 'read,write,policy,test',
      disabled: 'false',
      comment: 'Scheduler de teste criado via API REST ADD'
    };

    console.log('📋 Dados do scheduler:');
    console.log(JSON.stringify(schedulerData, null, 2));
    console.log('\n⏳ Enviando requisição via endpoint REST add...\n');

    const response = await axios.post(
      `${BASE_URL}/api/mikrotik/${MIKROTIK_ID}/rest/system/scheduler/add`,
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
      console.log(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(error.message);
    }
  }
}

// Executar testes
async function runTests() {
  console.log('🚀 Iniciando testes diretos do scheduler\n');
  console.log('=' .repeat(50));
  
  // Primeiro testar se API REST está funcionando
  await testSystemClock();
  
  console.log('\n' + '=' .repeat(50));
  
  // Testar criação com POST direto
  await testCreateSchedulerDirect();
  
  console.log('\n' + '=' .repeat(50));
  
  // Testar criação com ADD
  await testAddScheduler();
  
  console.log('\n✅ Testes concluídos!');
}

// Executar
runTests().catch(console.error);