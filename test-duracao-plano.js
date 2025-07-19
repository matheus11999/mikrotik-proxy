const axios = require('axios');

// Configurações do teste
const BASE_URL = 'http://router.mikropix.online';
const MIKROTIK_ID = 'ad8ba643-627d-4539-a6ef-e6636ee0773b';

// Função para gerar MAC address aleatório
function generateRandomMac() {
  const chars = '0123456789ABCDEF';
  let mac = '';
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 2 === 0) mac += ':';
    mac += chars[Math.floor(Math.random() * chars.length)];
  }
  return mac;
}

// Função para gerar IP aleatório na faixa 192.168.1.x
function generateRandomIP() {
  const lastOctet = Math.floor(Math.random() * 200) + 50; // 50-249
  return `192.168.1.${lastOctet}`;
}

// Função para demonstrar o cálculo correto baseado na duração do plano
function demonstrarCalculoCorreto(planoMinutos) {
  console.log(`📊 Demonstração do Cálculo Correto para Plano de ${planoMinutos} minutos\n`);
  
  const now = new Date();
  const expirationDate = new Date(now.getTime() + (planoMinutos * 60 * 1000));
  
  // Converter para timezone America/Manaus
  const manausTimeStr = expirationDate.toLocaleString("sv-SE", {
    timeZone: "America/Manaus",
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  const expirationStr = manausTimeStr.replace(',', '');
  const nowManausStr = now.toLocaleString("sv-SE", {
    timeZone: "America/Manaus",
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(',', '');
  
  console.log(`🕐 Horário atual (Manaus): ${nowManausStr}`);
  console.log(`⏰ Duração do plano: ${planoMinutos} minutos`);
  console.log(`🎯 Horário de expiração: ${expirationStr}`);
  console.log(`📝 Comentário esperado: C:17/07/2025 V:0.1 uuid e:${expirationStr}\n`);
  
  return { nowManausStr, expirationStr };
}

// Teste com diferentes durações de plano
async function testDiferentesDuracoes() {
  console.log('🚀 Testando diferentes durações de plano\n');
  console.log('=' .repeat(80));
  
  // Testar com plano de 5 minutos (valor original que estava falhando)
  const testCases = [
    { planoMinutos: 5, nome: 'Plano 5 minutos' },
    { planoMinutos: 30, nome: 'Plano 30 minutos' },
    { planoMinutos: 60, nome: 'Plano 1 hora' },
    { planoMinutos: 1440, nome: 'Plano 24 horas' }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n🧪 Testando ${testCase.nome}:`);
    
    const { nowManausStr, expirationStr } = demonstrarCalculoCorreto(testCase.planoMinutos);
    
    try {
      const randomMac = generateRandomMac();
      const randomIP = generateRandomIP();
      
      const bindingData = {
        address: randomIP,
        mac_address: randomMac,
        comment: `C:17/07/2025 V:0.1 ${Date.now()}-test`,
        expiration_minutes: testCase.planoMinutos // Usar duração do plano
      };

      console.log(`📋 Dados enviados:`)
      console.log(`   expiration_minutes: ${bindingData.expiration_minutes}`);
      console.log(`   MAC: ${randomMac}`);
      console.log(`   IP: ${randomIP}`);

      const response = await axios.post(
        `${BASE_URL}/api/mikrotik/public/create-ip-binding/${MIKROTIK_ID}`,
        bindingData,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      if (response.data.success) {
        const actualExpiration = response.data.expiration;
        console.log(`✅ IP binding criado com sucesso!`);
        console.log(`📊 Expiração calculada pela API: ${actualExpiration}`);
        console.log(`📊 Expiração esperada: ${expirationStr}`);
        console.log(`📊 Comentário: ${response.data.binding.comment}`);
        
        // Verificar se está próximo do esperado (tolerância de 5 minutos)
        const expectedTime = new Date(expirationStr + 'Z');
        const actualTime = new Date(actualExpiration + 'Z');
        const diffMinutes = Math.abs(expectedTime - actualTime) / (1000 * 60);
        
        if (diffMinutes <= 5) {
          console.log(`✅ Expiração CORRETA! (diferença: ${diffMinutes.toFixed(1)} min)`);
        } else {
          console.log(`❌ Expiração INCORRETA! (diferença: ${diffMinutes.toFixed(1)} min)`);
        }
      } else {
        console.log(`❌ Falha ao criar IP binding`);
        console.log(`Error: ${response.data.error}`);
      }

    } catch (error) {
      console.error(`❌ Erro ao criar IP binding:`, error.response?.data || error.message);
    }
    
    console.log('-' .repeat(80));
  }
}

// Teste simulando o cenário real da compra
async function testCenarioRealCompra() {
  console.log('\n📱 Simulando cenário real da compra:\n');
  console.log('=' .repeat(80));
  
  // Simular uma compra realizada às 13:30 com plano de 5 minutos
  const horarioCompra = '13:30:30';
  const planoMinutos = 5;
  
  console.log(`💳 Compra realizada às: ${horarioCompra}`);
  console.log(`🎯 Plano comprado: ${planoMinutos} minutos`);
  console.log(`⏰ Expiração deveria ser: ${horarioCompra.split(':')[0]}:${35}:${horarioCompra.split(':')[2]} (13:30 + 5 min = 13:35)`);
  
  const { nowManausStr, expirationStr } = demonstrarCalculoCorreto(planoMinutos);
  
  try {
    const randomMac = generateRandomMac();
    const randomIP = generateRandomIP();
    
    const bindingData = {
      address: randomIP,
      mac_address: randomMac,
      comment: `C:17/07/2025 V:0.1 23ccce4f-69c2-4697-949d-a0f14c526c13`,
      expiration_minutes: planoMinutos // CRUCIAL: usar duração do plano, não timestamp
    };

    console.log(`\n📋 Dados que deveriam ser enviados pelo backend:`)
    console.log(JSON.stringify(bindingData, null, 2));

    const response = await axios.post(
      `${BASE_URL}/api/mikrotik/public/create-ip-binding/${MIKROTIK_ID}`,
      bindingData,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data.success) {
      console.log(`\n✅ Resultado da API:`)
      console.log(`📊 Expiração calculada: ${response.data.expiration}`);
      console.log(`📊 Comentário final: ${response.data.binding.comment}`);
      
      // Verificar se não está mais usando o horário da compra
      const isUsingPurchaseTime = response.data.binding.comment.includes('e:2025-07-17 13:30');
      
      if (!isUsingPurchaseTime) {
        console.log(`✅ SUCESSO: Não está mais usando horário da compra como expiração!`);
        console.log(`🎉 Sistema corrigido - usando duração do plano corretamente!`);
      } else {
        console.log(`❌ PROBLEMA: Ainda está usando horário da compra!`);
        console.log(`🔧 Verifique se o backend está enviando expiration_minutes corretamente`);
      }
    } else {
      console.log(`❌ Falha ao criar IP binding: ${response.data.error}`);
    }

  } catch (error) {
    console.error(`❌ Erro:`, error.response?.data || error.message);
  }
}

// Executar testes
async function runTests() {
  console.log('🎯 Teste de Duração Correta dos Planos\n');
  
  await testDiferentesDuracoes();
  await testCenarioRealCompra();
  
  console.log('\n' + '=' .repeat(80));
  console.log('🏁 Testes concluídos!');
  console.log('\n📋 Pontos importantes:');
  console.log('   • expiration_minutes deve ser a DURAÇÃO do plano');
  console.log('   • NÃO deve ser o timestamp da compra');
  console.log('   • API calcula: agora + (duração * 60 * 1000)');
  console.log('   • Backend deve enviar planos.minutos como expiration_minutes');
}

// Executar
runTests().catch(console.error);