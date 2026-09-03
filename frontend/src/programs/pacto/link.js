const PACTO_PUBLIC_PATH = /^\/coleta\/pacto\/([A-Za-z0-9_-]{32,256})$/;

/**
 * O endereço copiado sempre nasce da origem do CPE que o administrador está
 * usando. Assim uma FRONTEND_URL antiga não pode enviar a escola para outro
 * projeto/site.
 */
export function resolvePactoPublicLink(path, currentOrigin) {
  const match = String(path || '').match(PACTO_PUBLIC_PATH);
  if (!match) throw new Error('A API retornou uma rota pública inválida para a coleta do Pacto.');
  const origin = new URL(currentOrigin).origin;
  return {
    token: match[1],
    path,
    url: new URL(path, origin).toString(),
  };
}
