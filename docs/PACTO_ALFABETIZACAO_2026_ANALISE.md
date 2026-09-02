# Pacto pela Alfabetização 2026 — análise do instrumento

## 1. Identificação confirmada

O programa informado pelo responsável é **Pacto pela Alfabetização 2026**.

O arquivo HTML recebido inicialmente é somente o índice/frameset de uma pasta de trabalho exportada pelo Microsoft Excel. Seus caminhos internos ainda usam um nome legado contendo `PARC-2026`, mas isso não altera a identificação confirmada do programa.

A escola usada no exemplo é E.M.E.I.E.F. Santa Anastácia, INEP 15066665, Abaetetuba.

## 2. Abrangência confirmada

O instrumento possui seis estruturas:

1. A0 — 1º ano;
2. A1-A3 — Língua Portuguesa — 1º ano;
3. A1-A3 — Matemática — 1º ano;
4. A0 — 2º ano;
5. A1-A3 — Língua Portuguesa — 2º ano;
6. A1-A3 — Matemática — 2º ano.

O responsável confirmou que as imagens apresentadas contêm a estrutura completa dos campos de preenchimento do programa.

## 3. Dimensões comuns

Todas as tabelas são agregadas **por turma** e apresentam:

1. ano escolar;
2. turno;
3. turma;
4. número/código da avaliação;
5. número de alunos matriculados;
6. número de alunos avaliados.

Os exemplos usam turnos `M` e `T`, turmas `A` e `B` e avaliações `A0`, `A1`, `A2` e `A3`. A expansão formal das siglas de turno ainda deve ser tratada como domínio do formulário, e não inferida do texto da planilha.

Foi definido que as turmas poderão seguir os dois fluxos:

- serem previamente cadastradas ou importadas pelo administrador;
- serem incluídas ou corrigidas pelo gestor no link da escola, dentro dos controles permitidos.

## 4. A0 — 1º ano

A avaliação A0 do 1º ano contém sete habilidades:

1. Coordenação motora;
2. Consciência fonológica — Aliteração;
3. Consciência fonológica — Sílabas;
4. Consciência fonológica — Rimas;
5. Princípio alfabético;
6. Compreensão oral;
7. Oralidade.

Para cada habilidade são informadas três quantidades:

- alunos por desenvolver;
- alunos em desenvolvimento;
- alunos desenvolvidos.

A estrutura possui seis campos de identificação/participação e 21 campos quantitativos, totalizando 27 colunas de entrada visíveis.

## 5. A1-A3 — Língua Portuguesa — 1º e 2º anos

Cada avaliação A1, A2 ou A3 contém três blocos.

### Leitura

- número de alunos pré-leitores;
- número de alunos leitores iniciais;
- número de alunos leitores fluentes.

### Compreensão de texto

- número de alunos que não compreendem;
- número de alunos que compreendem por oralidade;
- número de alunos que compreendem autonomamente.

### Escrita

- número de alunos pré-alfabéticos;
- número de alunos em nível alfabético inicial;
- número de alunos em nível alfabético completo.

Na tabela do 1º ano também são exibidos percentuais para cada uma das nove categorias. A imagem do 2º ano apresenta as quantidades; os percentuais poderão ser derivados pelo CPE a partir da mesma regra confirmada pelo responsável.

## 6. A1-A3 — Matemática — 1º e 2º anos

Cada avaliação A1, A2 ou A3 distribui os alunos em três níveis de proficiência:

- **Não proficiente:** alunos com até 4 pontos;
- **Proficiente inicial:** alunos com 5 a 6 pontos;
- **Proficiente:** alunos com 7 a 10 pontos.

A tabela também apresenta o percentual de cada nível.

## 7. A0 — 2º ano

A avaliação A0 do 2º ano contém quatro habilidades:

1. Princípio alfabético;
2. Decodificação;
3. Grafia de letras minúsculas;
4. Codificação.

Para cada habilidade são informadas as três quantidades:

- alunos por desenvolver;
- alunos em desenvolvimento;
- alunos desenvolvidos.

## 8. Lógica dos percentuais verificada

O responsável confirmou que o percentual deve ser calculado automaticamente pelo CPE. Os valores preenchidos na planilha demonstram a fórmula:

```text
percentual do nível = quantidade de alunos no nível / número de alunos avaliados × 100
```

O resultado é exibido como percentual inteiro, com arredondamento convencional. Exemplos observados:

- 16 de 17 = 94%;
- 1 de 17 = 6%;
- 14 de 19 = 74%;
- 3 de 19 = 16%.

Os percentuais são arredondados individualmente. Por isso, a soma visual pode resultar em 99%, 100% ou 101%; isso não representa erro quando as quantidades fecham corretamente.

Se o número de alunos avaliados for zero, o percentual não deve realizar divisão e deve permanecer sem valor calculado.

## 9. Lógica das somas verificada

Foram conferidos todos os 40 conjuntos preenchidos visíveis nas imagens:

- Língua Portuguesa do 1º ano: 12 conjuntos;
- Matemática do 1º ano: 4 conjuntos;
- Língua Portuguesa do 2º ano: 12 conjuntos;
- A0 do 2º ano: 8 conjuntos;
- Matemática do 2º ano: 4 conjuntos.

Em todos eles, a soma das três categorias é exatamente igual ao número de alunos avaliados. Isso sustenta a seguinte validação do instrumento:

```text
nível 1 + nível 2 + nível 3 = alunos avaliados
```

A decisão final entre bloquear o envio ou apenas alertar ainda precisa ser confirmada pelo responsável.

## 10. Inconsistência encontrada na própria amostra

Na tabela de Matemática do 2º ano, turma M/A, avaliação A2, aparecem:

- 18 alunos matriculados;
- 19 alunos avaliados;
- níveis 3 + 7 + 9 = 19;
- percentuais 16% + 37% + 47% = 100%.

Os níveis e percentuais são coerentes com 19 avaliados, mas o número de avaliados é maior que o de matriculados. Pode ser um erro da planilha, uma atualização de matrícula ou uma regra operacional não documentada.

Enquanto isso não for esclarecido, `avaliados <= matriculados` não deve ser uma validação bloqueante. O CPE pode apresentar um alerta para conferência.

## 11. Consequências arquiteturais

O modelo compartilhado `Result`, agregado por programa e escola, não representa sozinho este instrumento. O módulo específico do Pacto precisa manter pelo menos:

```text
Programa
  → Escola
    → Ano escolar
      → Turno
        → Turma
          → Avaliação A0/A1/A2/A3
            → Componente ou bloco
              → Habilidade/nível
                → Quantidade e percentual derivado
```

Os dados são agregados por turma; as imagens não apresentam identificação individual de alunos.

Como A1, A2 e A3 podem ser preenchidas em momentos diferentes, o desenho da coleta deve permitir rascunho, envio e eventual reabertura por etapa de avaliação, sem exigir que avaliações futuras estejam preenchidas.

Nenhuma fórmula de nota geral, classificação de escola ou ranking aparece no instrumento recebido. O módulo não deve reutilizar automaticamente o motor genérico de ranking do CPE sem uma regra oficial adicional.

## 12. Proposta preliminar de formulário

Sem reproduzir a planilha inteira na tela, o formulário pode ser organizado em:

1. identificação segura da escola, já vinculada ao link;
2. seleção ou cadastro das turmas;
3. escolha do ano escolar e da avaliação disponível;
4. dados de matrícula e participação;
5. Língua Portuguesa ou habilidades da A0;
6. Matemática, quando aplicável;
7. conferência de somas, percentuais e alertas;
8. envio da etapa.

Essa organização não altera os campos oficiais; apenas distribui o preenchimento em seções mais legíveis.

## 13. Decisões confirmadas

O responsável definiu:

1. divergência entre a soma dos níveis e alunos avaliados **bloqueia o envio**, mas não impede salvar rascunho;
2. avaliados acima de matriculados são permitidos com **alerta de conferência**;
3. A0, A1, A2 e A3 possuem **envios independentes**;
4. turmas podem ser preparadas pelo administrador e também incluídas/corrigidas pela escola;
5. percentuais são automáticos, inteiros e derivados das quantidades;
6. a regra oficial de ranking será fornecida posteriormente; até lá, o Pacto não produz nota geral, classificação ou ranking de escolas.

A validade do link é escolhida explicitamente pelo administrador no momento da geração. Gerar um novo link revoga os links ativos anteriores da mesma escola e programa.

## 14. Implementação correspondente

A implementação usa o código técnico estável `PACTO-ALFABETIZACAO-2026`, ciclo 2026. O nome de exibição não é usado para decidir regras.

Componentes principais:

- `backend/src/programs/pacto/config.js`: matriz oficial das seis estruturas;
- `backend/src/programs/pacto/service.js`: token seguro, turmas, rascunhos, envios, reabertura, percentuais, validações e consolidação;
- `frontend/src/programs/pacto/PactoAdmin.jsx`: acompanhamento administrativo, links, status, dados e exportação;
- `frontend/src/pages/PactoCollection.jsx`: formulário público por etapas;
- `ProgramCollectionLink`: somente hash do token, validade, revogação e último acesso;
- `PactoClass`: turma por escola/programa;
- `PactoAssessment`: unidade de envio A0/A1/A2/A3;
- `PactoAssessmentComponent`: matrícula e participação por componente;
- `PactoSkillResult`: quantidade por habilidade e nível; percentual não é persistido.

A migration foi apenas versionada no repositório. Ela não deve ser aplicada em produção sem revisão do plano de implantação e backup do banco existente.
