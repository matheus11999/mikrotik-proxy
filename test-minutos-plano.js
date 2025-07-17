// Teste para verificar se o cálculo de minutos está correto no frontend

// Convert MikroTik timeout format to seconds (mesma função do frontend)
const convertToSeconds = (timeoutStr) => {
  if (!timeoutStr) return 0
  
  // Remove espaços e converter para lowercase
  const cleanStr = timeoutStr.trim().toLowerCase()
  
  // Se já for um número (segundos), retorna
  if (/^\d+$/.test(cleanStr)) {
    return parseInt(cleanStr)
  }
  
  // Extrair número e unidade
  const match = cleanStr.match(/^(\d+)([smhd]?)$/)
  if (!match) return 0
  
  const value = parseInt(match[1])
  const unit = match[2] || 's' // padrão é segundos
  
  switch (unit) {
    case 's': return value
    case 'm': return value * 60
    case 'h': return value * 3600
    case 'd': return value * 86400
    default: return value
  }
}

// Simulação do que acontece no frontend (UserProfiles.tsx)
function testarCalculoMinutos() {
  console.log('🧪 Testando cálculo de minutos dos planos\n');
  
  // Casos de teste baseados no que o MikroTik retorna
  const testCases = [
    { session_timeout: '5m', expected_minutes: 5 },
    { session_timeout: '1h', expected_minutes: 60 },
    { session_timeout: '30m', expected_minutes: 30 },
    { session_timeout: '2h', expected_minutes: 120 },
    { session_timeout: '300', expected_minutes: 5 }, // 300 segundos = 5 minutos
    { session_timeout: '3600', expected_minutes: 60 }, // 3600 segundos = 60 minutos
    { session_timeout: undefined, expected_minutes: null },
    { session_timeout: '', expected_minutes: null },
    { session_timeout: '0', expected_minutes: 0 }
  ];
  
  console.log('📊 Testando diferentes formatos de session_timeout:\n');
  
  testCases.forEach((testCase, index) => {
    const { session_timeout, expected_minutes } = testCase;
    
    // Aplicar a lógica corrigida do frontend
    const calculatedMinutes = session_timeout ? 
      Math.floor(convertToSeconds(session_timeout) / 60) : 
      null;
    
    const passed = calculatedMinutes === expected_minutes;
    const status = passed ? '✅' : '❌';
    
    console.log(`${status} Teste ${index + 1}:`);
    console.log(`   Input: "${session_timeout}"`);
    console.log(`   Expected: ${expected_minutes} minutos`);
    console.log(`   Calculated: ${calculatedMinutes} minutos`);
    console.log(`   Status: ${passed ? 'PASSOU' : 'FALHOU'}\n`);
  });
  
  return testCases.every(testCase => {
    const calculatedMinutes = testCase.session_timeout ? 
      Math.floor(convertToSeconds(testCase.session_timeout) / 60) : 
      null;
    return calculatedMinutes === testCase.expected_minutes;
  });
}

// Função para simular o que acontece no sync
function testarSyncProfile() {
  console.log('🔄 Testando sincronização de perfil\n');
  
  // Simular dados que vêm do MikroTik
  const profile = {
    '.id': '*6',
    'name': 'teste',
    'session-timeout': '5m',
    'rate-limit': '10M/1M',
    'idle-timeout': '1m'
  };
  
  const valorNumerico = 0.1;
  const mikrotikId = 'ad8ba643-627d-4539-a6ef-e6636ee0773b';
  
  // Parse session timeout com a correção
  const sessionTimeout = profile['session-timeout'] || '';
  const sessionTimeoutNumber = sessionTimeout ? convertToSeconds(sessionTimeout) : null;
  
  // Parse rate limit
  const rateLimit = profile['rate-limit'] || '';
  const rateLimitParts = rateLimit.includes('/') ? rateLimit.split('/') : ['', ''];
  
  const profilePayload = {
    mikrotik_id: mikrotikId,
    nome: profile.name || '',
    valor: valorNumerico,
    descricao: `Plano ${profile.name || 'Sem nome'}`,
    rate_limit: rateLimit || null,
    session_timeout: sessionTimeout || null,
    idle_timeout: profile['idle-timeout'] || null,
    velocidade_upload: rateLimitParts[0] || null,
    velocidade_download: rateLimitParts[1] || null,
    minutos: sessionTimeoutNumber ? Math.floor(sessionTimeoutNumber / 60) : null,
    ativo: !profile.disabled,
    visivel: true,
    ordem: 0,
    mikrotik_profile_id: profile['.id'] || profile.name
  };
  
  console.log('📋 Dados originais do MikroTik:');
  console.log(`   session-timeout: "${sessionTimeout}"`);
  console.log(`   Número extraído: ${sessionTimeoutNumber}`);
  console.log(`   Minutos calculados: ${profilePayload.minutos}`);
  console.log();
  
  console.log('📦 Payload para Supabase:');
  console.log(JSON.stringify(profilePayload, null, 2));
  
  // Verificar se está correto
  const expected = 5; // 5 minutos
  const actual = profilePayload.minutos;
  const passed = actual === expected;
  
  console.log(`\n${passed ? '✅' : '❌'} Resultado: ${passed ? 'CORRETO' : 'INCORRETO'}`);
  console.log(`   Expected: ${expected} minutos`);
  console.log(`   Actual: ${actual} minutos`);
  
  return passed;
}

// Executar testes
async function runTests() {
  console.log('🚀 Teste de Cálculo de Minutos dos Planos\n');
  console.log('=' .repeat(60));
  
  const test1 = testarCalculoMinutos();
  console.log('=' .repeat(60));
  
  const test2 = testarSyncProfile();
  console.log('\n' + '=' .repeat(60));
  
  if (test1 && test2) {
    console.log('✅ TODOS OS TESTES PASSARAM!');
    console.log('🎉 Cálculo de minutos funcionando corretamente');
    console.log('\n📋 Correções implementadas:');
    console.log('   • Remoção de caracteres não numéricos do session_timeout');
    console.log('   • Conversão correta de segundos para minutos');
    console.log('   • Tratamento de valores undefined/null');
    console.log('   • Suporte para formatos "5m", "1h", "300" (segundos)');
  } else {
    console.log('❌ ALGUNS TESTES FALHARAM');
    console.log('🔧 Verifique a implementação no frontend');
  }
  
  console.log('\n🏁 Teste concluído!');
}

// Executar
runTests().catch(console.error);