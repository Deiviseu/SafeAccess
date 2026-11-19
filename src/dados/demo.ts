/*
  DADOS DE DEMONSTRAÇÃO (o que ainda resta)
  -----------------------------------------
  O login, o perfil e os últimos acessos já vêm do Supabase.
  Só a biometria e o QR Code continuam simulados até a próxima etapa
  (Edge Functions de passkey + emitir_qr_token, com validade de 60 s).
*/

// Validade do QR Code na demonstração (o protótipo usa 30 segundos)
export const VALIDADE_QR_SEGUNDOS = 30
