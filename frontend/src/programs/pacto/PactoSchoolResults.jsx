import React, { useState, useMemo, useEffect } from 'react';
import { useApi, clearApiCache } from '../../hooks/useApi.js';
import { pactoAdminApi } from '../../services/resources.js';
import { resolvePactoPublicLink } from './link.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Select } from '../../components/ui.jsx';
import { formatGradeLabel } from './dashboard.js';
import { fmt, fmtInt } from '../../utils/format.js';

const COMPONENT_TABS = [
  { key: 'PORTUGUES', label: 'Língua Portuguesa', icon: '📖', color: '#0284c7' },
  { key: 'MATEMATICA', label: 'Matemática', icon: '📐', color: '#7c3aed' },
  { key: 'INICIAL', label: 'Habilidades Iniciais (PII / A0)', icon: '👶', color: '#059669' },
];

const STATUS_MAP = {
  NAO_INICIADA: { label: 'Não iniciada', cls: 'badge-gray' },
  EM_PREENCHIMENTO: { label: 'Em preenchimento', cls: 'badge-yellow' },
  PARCIAL: { label: 'Envios parciais', cls: 'badge-blue' },
  CONCLUIDA: { label: 'Concluída', cls: 'badge-green' },
};

const ALL_ASSESSMENTS = ['A0', 'A1', 'A2', 'A3'];
const ASSESSMENT_ORDER = { A0: 0, A1: 1, A2: 2, A3: 3 };

/**
 * Obtém a avaliação mais recente de uma turma para um determinado componente (ou geral)
 */
function getLatestAssessmentForClass(pactoClass, componentKey) {
  const assessments = pactoClass.assessments || [];
  if (assessments.length === 0) return null;

  const withData = assessments.filter((a) => {
    if (!componentKey) {
      return (
        a.status === 'ENVIADO' ||
        (a.components && a.components.some((c) => (c.evaluated || 0) > 0 || (c.results && c.results.length > 0)))
      );
    }
    const comp = (a.components || []).find((c) => c.component === componentKey);
    return comp && ((comp.evaluated || 0) > 0 || (comp.results && comp.results.length > 0) || a.status === 'ENVIADO');
  });

  const targetList = withData.length > 0 ? withData : assessments;
  return [...targetList].sort((a, b) => (ASSESSMENT_ORDER[b.code] ?? 0) - (ASSESSMENT_ORDER[a.code] ?? 0))[0] || null;
}

/**
 * Renderiza mini-tags de habilidade coloridas
 */
function renderSkillBadge(label, count, tone) {
  const bg = tone === 'red' ? '#fee2e2' : tone === 'yellow' ? '#fef3c7' : '#dcfce7';
  const color = tone === 'red' ? '#b91c1c' : tone === 'yellow' ? '#b45309' : '#15803d';
  return (
    <span
      key={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '1px 5px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        background: bg,
        color: color,
        lineHeight: 1.2,
      }}
    >
      <span>{label}:</span>
      <span>{count}</span>
    </span>
  );
}

/**
 * Formata visualmente os resultados por habilidade na tabela de turmas
 */
function renderResultsBreakdown(results, componentKey) {
  if (!results || results.length === 0) {
    return <span style={{ color: 'var(--text-3, #94a3b8)', fontSize: 11 }}>Sem lançamentos</span>;
  }

  const map = {};
  for (const r of results) {
    const s = r.skill || componentKey;
    if (!map[s]) map[s] = {};
    map[s][r.level] = (map[s][r.level] || 0) + (r.count || 0);
  }

  if (componentKey === 'PORTUGUES') {
    const leit = map.LEITURA || {};
    const comp = map.COMPREENSAO_TEXTO || {};
    const esc = map.ESCRITA || {};

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {(leit.PRE_LEITOR !== undefined || leit.LEITOR_INICIAL !== undefined || leit.LEITOR_FLUENTE !== undefined) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-2, #64748b)', minWidth: 44 }}>Leitura:</span>
            {renderSkillBadge('PL', leit.PRE_LEITOR || 0, 'red')}
            {renderSkillBadge('LI', leit.LEITOR_INICIAL || 0, 'yellow')}
            {renderSkillBadge('LF', leit.LEITOR_FLUENTE || 0, 'green')}
          </div>
        )}
        {(comp.NAO_COMPREENDE !== undefined || comp.COMPREENDE_ORALIDADE !== undefined || comp.COMPREENDE_AUTONOMAMENTE !== undefined) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-2, #64748b)', minWidth: 44 }}>Compr.:</span>
            {renderSkillBadge('NC', comp.NAO_COMPREENDE || 0, 'red')}
            {renderSkillBadge('CO', comp.COMPREENDE_ORALIDADE || 0, 'yellow')}
            {renderSkillBadge('CA', comp.COMPREENDE_AUTONOMAMENTE || 0, 'green')}
          </div>
        )}
        {(esc.PRE_ALFABETICO !== undefined || esc.ALFABETICO_INICIAL !== undefined || esc.ALFABETICO_COMPLETO !== undefined) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-2, #64748b)', minWidth: 44 }}>Escrita:</span>
            {renderSkillBadge('PA', esc.PRE_ALFABETICO || 0, 'red')}
            {renderSkillBadge('AI', esc.ALFABETICO_INICIAL || 0, 'yellow')}
            {renderSkillBadge('AC', esc.ALFABETICO_COMPLETO || 0, 'green')}
          </div>
        )}
      </div>
    );
  }

  if (componentKey === 'MATEMATICA') {
    const mat = map.PROFICIENCIA_MATEMATICA || map.MATEMATICA || {};
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-2, #64748b)', minWidth: 48 }}>Profic.:</span>
        {renderSkillBadge('NP (até 4)', mat.NAO_PROFICIENTE || 0, 'red')}
        {renderSkillBadge('PI (5-6)', mat.PROFICIENTE_INICIAL || 0, 'yellow')}
        {renderSkillBadge('P (7-10)', mat.PROFICIENTE || 0, 'green')}
      </div>
    );
  }

  if (componentKey === 'INICIAL') {
    const ini = map.INICIAL || {};
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {renderSkillBadge('PD', ini.POR_DESENVOLVER || 0, 'red')}
        {renderSkillBadge('ED', ini.EM_DESENVOLVIMENTO || 0, 'yellow')}
        {renderSkillBadge('D', ini.DESENVOLVIDO || 0, 'green')}
      </div>
    );
  }

  return <span>{results.map((r) => `${r.level}: ${r.count}`).join(' · ')}</span>;
}

export default function PactoSchoolResults({ program, onSelectTab }) {
  const { success, error: toastError } = useToast();

  // Modo de visualização: 'DETAIL' (Análise por Escola) | 'MANAGE' (Gestão Geral de Resultados)
  const [viewMode, setViewMode] = useState('DETAIL');

  // Estado da Análise por Escola
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('ALL'); // 'ALL' | 0 | 1 | 2
  const [selectedAssessment, setSelectedAssessment] = useState('ALL'); // 'ALL' | 'A0' | 'A1' | 'A2' | 'A3'
  const [activeComponent, setActiveComponent] = useState('PORTUGUES');
  const [schoolSearch, setSchoolSearch] = useState('');

  // Estado da Gestão em Lote
  const [manageComponent, setManageComponent] = useState('TODOS');
  const [manageGrade, setManageGrade] = useState('TODOS');
  const [manageAssessment, setManageAssessment] = useState('TODOS');
  const [manageStatus, setManageStatus] = useState('ALL');
  const [manageSearch, setManageSearch] = useState('');
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState(new Set());

  // Modais
  const [linkModal, setLinkModal] = useState(null);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [expiresAt, setExpiresAt] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [classModal, setClassModal] = useState(false);
  const [classForm, setClassForm] = useState({
    grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS,
  });
  const [deletingAssessment, setDeletingAssessment] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Busca dados oficiais do Pacto
  const { data: overview, loading, error, refresh } = useApi(
    () => pactoAdminApi.overview(program.id),
    [program.id],
  );

  const schools = overview?.schools || [];

  // Seleciona primeira escola por padrão quando carregar
  useEffect(() => {
    if (!selectedSchoolId && schools.length > 0) {
      setSelectedSchoolId(schools[0].id);
    }
  }, [schools, selectedSchoolId]);

  // Lista de escolas filtrada na coluna lateral com contagem real de alunos na última avaliação
  const filteredSchools = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return schools
      .filter((s) => {
        if (!q) return true;
        const name = (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const inep = String(s.inep || '');
        return name.includes(q) || inep.includes(q);
      })
      .map((s) => {
        // Calcula alunos únicos da escola considerando a última avaliação de cada turma
        let schoolEnrolled = 0;
        let schoolEvaluated = 0;
        for (const c of s.classes || []) {
          const latestA = getLatestAssessmentForClass(c, null);
          if (latestA && latestA.components && latestA.components.length > 0) {
            schoolEnrolled += Math.max(...latestA.components.map((comp) => comp.enrolled || 0));
            schoolEvaluated += Math.max(...latestA.components.map((comp) => comp.evaluated || 0));
          }
        }
        return {
          ...s,
          realEnrolled: schoolEnrolled,
          realEvaluated: schoolEvaluated,
        };
      });
  }, [schools, schoolSearch]);

  // Escola selecionada
  const selectedSchool = useMemo(() => {
    return schools.find((s) => s.id === selectedSchoolId) || schools[0] || null;
  }, [schools, selectedSchoolId]);

  // Turmas da escola selecionada
  const schoolClasses = useMemo(() => {
    if (!selectedSchool?.classes) return [];
    return selectedSchool.classes;
  }, [selectedSchool]);

  // Turmas filtradas pelo Ano selecionado
  const filteredClasses = useMemo(() => {
    return schoolClasses.filter((c) => {
      if (selectedGrade !== 'ALL' && Number(c.grade) !== Number(selectedGrade)) return false;
      return true;
    });
  }, [schoolClasses, selectedGrade]);

  // Consolidação de métricas: DEDUPLICAÇÃO POR ÚLTIMA AVALIAÇÃO E ISOLAMENTO DE COMPONENTES
  const componentMetrics = useMemo(() => {
    let totalEnrolled = 0;
    let totalEvaluated = 0;

    const skillsCount = {
      // Português
      LEITURA: { PRE_LEITOR: 0, LEITOR_INICIAL: 0, LEITOR_FLUENTE: 0 },
      COMPREENSAO_TEXTO: { NAO_COMPREENDE: 0, COMPREENDE_ORALIDADE: 0, COMPREENDE_AUTONOMAMENTE: 0 },
      ESCRITA: { PRE_ALFABETICO: 0, ALFABETICO_INICIAL: 0, ALFABETICO_COMPLETO: 0 },
      // Matemática
      PROFICIENCIA_MATEMATICA: { NAO_PROFICIENTE: 0, PROFICIENTE_INICIAL: 0, PROFICIENTE: 0 },
      // Habilidades Iniciais
      INICIAL: { POR_DESENVOLVER: 0, EM_DESENVOLVIMENTO: 0, DESENVOLVIDO: 0 },
    };

    // 1. Monta a lista completa de avaliações para a tabela detalhada por turma
    const matchingAssessmentsList = [];
    const latestAssessmentCodeByClass = new Map();

    for (const c of filteredClasses) {
      const latestA = getLatestAssessmentForClass(c, activeComponent);
      if (latestA) {
        latestAssessmentCodeByClass.set(c.id, latestA.code);
      }

      for (const a of c.assessments || []) {
        if (selectedAssessment !== 'ALL' && a.code !== selectedAssessment) continue;

        const targetComponent = (a.components || []).find((comp) => comp.component === activeComponent);
        if (!targetComponent) continue;

        matchingAssessmentsList.push({
          classInfo: c,
          assessment: a,
          component: targetComponent,
          isLatest: latestA?.code === a.code,
        });
      }
    }

    // 2. Calcula Totais de Matriculados, Avaliados e Distribuição de Habilidades:
    // REGRA FUNDAMENTAL:
    // - Se 'selectedAssessment' for específico (ex.: 'A1'), contabiliza os dados daquela avaliação.
    // - Se 'selectedAssessment' for 'ALL' (Todas), contabiliza APENAS a ÚLTIMA AVALIAÇÃO de cada turma,
    //   evitando a duplicação dos mesmos alunos entre A1, A2 e A3!
    for (const c of filteredClasses) {
      let targetAssessment = null;

      if (selectedAssessment !== 'ALL') {
        targetAssessment = (c.assessments || []).find((a) => a.code === selectedAssessment) || null;
      } else {
        targetAssessment = getLatestAssessmentForClass(c, activeComponent);
      }

      if (!targetAssessment) continue;

      const targetComponent = (targetAssessment.components || []).find((comp) => comp.component === activeComponent);
      if (!targetComponent) continue;

      totalEnrolled += (targetComponent.enrolled || 0);
      totalEvaluated += (targetComponent.evaluated || 0);

      for (const res of targetComponent.results || []) {
        const skillKey = res.skill;
        const levelKey = res.level;
        if (skillsCount[skillKey] && skillsCount[skillKey][levelKey] !== undefined) {
          skillsCount[skillKey][levelKey] += (res.count || 0);
        } else if (activeComponent === 'INICIAL' && skillsCount.INICIAL[levelKey] !== undefined) {
          skillsCount.INICIAL[levelKey] += (res.count || 0);
        }
      }
    }

    const partRate = totalEnrolled > 0
      ? Math.round((totalEvaluated / totalEnrolled) * 1000) / 10
      : 100;

    // Calcula percentuais das habilidades
    const calcPct = (count, total) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

    const leituraTotal = skillsCount.LEITURA.PRE_LEITOR + skillsCount.LEITURA.LEITOR_INICIAL + skillsCount.LEITURA.LEITOR_FLUENTE || totalEvaluated;
    const compreensaoTotal = skillsCount.COMPREENSAO_TEXTO.NAO_COMPREENDE + skillsCount.COMPREENSAO_TEXTO.COMPREENDE_ORALIDADE + skillsCount.COMPREENSAO_TEXTO.COMPREENDE_AUTONOMAMENTE || totalEvaluated;
    const escritaTotal = skillsCount.ESCRITA.PRE_ALFABETICO + skillsCount.ESCRITA.ALFABETICO_INICIAL + skillsCount.ESCRITA.ALFABETICO_COMPLETO || totalEvaluated;
    const matTotal = skillsCount.PROFICIENCIA_MATEMATICA.NAO_PROFICIENTE + skillsCount.PROFICIENCIA_MATEMATICA.PROFICIENTE_INICIAL + skillsCount.PROFICIENCIA_MATEMATICA.PROFICIENTE || totalEvaluated;

    return {
      totalEnrolled,
      totalEvaluated,
      partRate,
      matchingAssessmentsList,
      leitura: {
        pl: { count: skillsCount.LEITURA.PRE_LEITOR, pct: calcPct(skillsCount.LEITURA.PRE_LEITOR, leituraTotal) },
        li: { count: skillsCount.LEITURA.LEITOR_INICIAL, pct: calcPct(skillsCount.LEITURA.LEITOR_INICIAL, leituraTotal) },
        lf: { count: skillsCount.LEITURA.LEITOR_FLUENTE, pct: calcPct(skillsCount.LEITURA.LEITOR_FLUENTE, leituraTotal) },
      },
      compreensao: {
        nc: { count: skillsCount.COMPREENSAO_TEXTO.NAO_COMPREENDE, pct: calcPct(skillsCount.COMPREENSAO_TEXTO.NAO_COMPREENDE, compreensaoTotal) },
        co: { count: skillsCount.COMPREENSAO_TEXTO.COMPREENDE_ORALIDADE, pct: calcPct(skillsCount.COMPREENSAO_TEXTO.COMPREENDE_ORALIDADE, compreensaoTotal) },
        ca: { count: skillsCount.COMPREENSAO_TEXTO.COMPREENDE_AUTONOMAMENTE, pct: calcPct(skillsCount.COMPREENSAO_TEXTO.COMPREENDE_AUTONOMAMENTE, compreensaoTotal) },
      },
      escrita: {
        pa: { count: skillsCount.ESCRITA.PRE_ALFABETICO, pct: calcPct(skillsCount.ESCRITA.PRE_ALFABETICO, escritaTotal) },
        ai: { count: skillsCount.ESCRITA.ALFABETICO_INICIAL, pct: calcPct(skillsCount.ESCRITA.ALFABETICO_INICIAL, escritaTotal) },
        ac: { count: skillsCount.ESCRITA.ALFABETICO_COMPLETO, pct: calcPct(skillsCount.ESCRITA.ALFABETICO_COMPLETO, escritaTotal) },
      },
      matematica: {
        np: { count: skillsCount.PROFICIENCIA_MATEMATICA.NAO_PROFICIENTE, pct: calcPct(skillsCount.PROFICIENCIA_MATEMATICA.NAO_PROFICIENTE, matTotal) },
        pi: { count: skillsCount.PROFICIENCIA_MATEMATICA.PROFICIENTE_INICIAL, pct: calcPct(skillsCount.PROFICIENCIA_MATEMATICA.PROFICIENTE_INICIAL, matTotal) },
        p: { count: skillsCount.PROFICIENCIA_MATEMATICA.PROFICIENTE, pct: calcPct(skillsCount.PROFICIENCIA_MATEMATICA.PROFICIENTE, matTotal) },
      },
      inicial: {
        pd: { count: skillsCount.INICIAL.POR_DESENVOLVER, pct: calcPct(skillsCount.INICIAL.POR_DESENVOLVER, totalEvaluated) },
        ed: { count: skillsCount.INICIAL.EM_DESENVOLVIMENTO, pct: calcPct(skillsCount.INICIAL.EM_DESENVOLVIMENTO, totalEvaluated) },
        d: { count: skillsCount.INICIAL.DESENVOLVIDO, pct: calcPct(skillsCount.INICIAL.DESENVOLVIDO, totalEvaluated) },
      },
    };
  }, [filteredClasses, activeComponent, selectedAssessment]);

  // Lista consolidada de todas as avaliações de todas as escolas (para modo Gestão)
  const allManagedAssessments = useMemo(() => {
    const list = [];
    for (const school of schools) {
      for (const cls of school.classes || []) {
        for (const ass of cls.assessments || []) {
          for (const comp of ass.components || []) {
            if (manageComponent !== 'TODOS' && comp.component !== manageComponent) continue;
            if (manageGrade !== 'TODOS' && Number(cls.grade) !== Number(manageGrade)) continue;
            if (manageAssessment !== 'TODOS' && ass.code !== manageAssessment) continue;
            if (manageStatus !== 'ALL' && ass.status !== manageStatus) continue;

            if (manageSearch.trim()) {
              const q = manageSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const sName = (school.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              const inep = String(school.inep || '');
              const cName = (cls.name || '').toLowerCase();
              if (!sName.includes(q) && !inep.includes(q) && !cName.includes(q)) continue;
            }

            list.push({
              id: `${ass.id}_${comp.component}`,
              assessmentId: ass.id,
              schoolId: school.id,
              schoolName: school.name,
              schoolInep: school.inep,
              grade: cls.grade,
              shift: cls.shift,
              className: cls.name,
              assessmentCode: ass.code,
              status: ass.status,
              component: comp.component,
              enrolled: comp.enrolled,
              evaluated: comp.evaluated,
              results: comp.results || [],
            });
          }
        }
      }
    }
    return list;
  }, [schools, manageComponent, manageGrade, manageAssessment, manageStatus, manageSearch]);

  // Seleção de linhas no modo Gestão
  const toggleSelectAll = () => {
    if (selectedAssessmentIds.size === allManagedAssessments.length) {
      setSelectedAssessmentIds(new Set());
    } else {
      setSelectedAssessmentIds(new Set(allManagedAssessments.map((a) => a.assessmentId)));
    }
  };

  const toggleSelectRow = (assessmentId) => {
    const next = new Set(selectedAssessmentIds);
    if (next.has(assessmentId)) next.delete(assessmentId);
    else next.add(assessmentId);
    setSelectedAssessmentIds(next);
  };

  // Excluir avaliação individual
  const handleDeleteAssessment = async () => {
    if (!deletingAssessment) return;
    setIsProcessing(true);
    try {
      await pactoAdminApi.deleteAssessment(program.id, deletingAssessment.assessmentId || deletingAssessment.id);
      success('Avaliação excluída com sucesso.');
      setDeletingAssessment(null);
      clearApiCache();
      refresh();
    } catch (err) {
      toastError(err.message || 'Erro ao excluir avaliação.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Excluir avaliações selecionadas em lote
  const handleBulkDelete = async () => {
    if (selectedAssessmentIds.size === 0) return;
    if (!window.confirm(`Deseja realmente excluir as ${selectedAssessmentIds.size} avaliações selecionadas?`)) return;

    setIsProcessing(true);
    try {
      for (const id of selectedAssessmentIds) {
        await pactoAdminApi.deleteAssessment(program.id, id);
      }
      success(`${selectedAssessmentIds.size} avaliações excluídas com sucesso.`);
      setSelectedAssessmentIds(new Set());
      clearApiCache();
      refresh();
    } catch (err) {
      toastError(err.message || 'Erro ao excluir avaliações em lote.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reabrir avaliação enviada
  const handleReopenAssessment = async (assessmentId) => {
    setIsProcessing(true);
    try {
      await pactoAdminApi.reopenAssessment(program.id, assessmentId);
      success('Avaliação reaberta para edição.');
      clearApiCache();
      refresh();
    } catch (err) {
      toastError(err.message || 'Erro ao reabrir avaliação.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Geração de Link Exclusivo
  const generateLink = async () => {
    if (!linkModal) return;
    setIsProcessing(true);
    try {
      const endOfDay = new Date(`${expiresAt}T23:59:59`);
      const result = await pactoAdminApi.generateLink(program.id, linkModal.id, endOfDay.toISOString());
      const publicLink = resolvePactoPublicLink(result.path, window.location.origin);
      setGeneratedLink(publicLink.url);
      success('Link exclusivo gerado com sucesso.');
      refresh();
    } catch (err) {
      toastError(err.message || 'Erro ao gerar link.');
    } finally {
      setIsProcessing(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      success('Link copiado para a área de transferência.');
    } catch {
      toastError('Não foi possível copiar automaticamente.');
    }
  };

  // Salvar Turma
  const handleSaveClass = async (e) => {
    e.preventDefault();
    if (!classForm.name.trim()) {
      toastError('Informe a identificação da turma.');
      return;
    }
    setIsProcessing(true);
    try {
      await pactoAdminApi.createClass(program.id, {
        schoolId: selectedSchool.id,
        grade: Number(classForm.grade),
        shift: classForm.shift,
        name: classForm.name.toUpperCase().trim(),
        enabledAssessments: classForm.enabledAssessments,
      });
      success('Turma cadastrada com sucesso!');
      setClassModal(false);
      setClassForm({ grade: 1, shift: 'M', name: '', enabledAssessments: ALL_ASSESSMENTS });
      clearApiCache();
      refresh();
    } catch (err) {
      toastError(err.message || 'Erro ao cadastrar turma.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading && !overview) {
    return <LoadingBlock message="Carregando resultados por escola do Pacto pela Alfabetização..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Barra de alternância de modo de visualização */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', background: 'var(--surface-2, #e2e8f0)', borderRadius: 8, padding: 3, gap: 4 }}>
          <button
            type="button"
            onClick={() => setViewMode('DETAIL')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: viewMode === 'DETAIL' ? 'var(--surface, #ffffff)' : 'transparent',
              fontWeight: viewMode === 'DETAIL' ? 700 : 500,
              color: viewMode === 'DETAIL' ? 'var(--primary, #0284c7)' : 'var(--text-2, #64748b)',
              cursor: 'pointer',
              fontSize: 13,
              boxShadow: viewMode === 'DETAIL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            📊 Análise por Escola
          </button>
          <button
            type="button"
            onClick={() => setViewMode('MANAGE')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: viewMode === 'MANAGE' ? 'var(--surface, #ffffff)' : 'transparent',
              fontWeight: viewMode === 'MANAGE' ? 700 : 500,
              color: viewMode === 'MANAGE' ? 'var(--primary, #0284c7)' : 'var(--text-2, #64748b)',
              cursor: 'pointer',
              fontSize: 13,
              boxShadow: viewMode === 'MANAGE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            📋 Gestão de Resultados ({allManagedAssessments.length})
          </button>
        </div>

        {onSelectTab && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onSelectTab('overview')}
            style={{ fontSize: 12.5 }}
          >
            ← Voltar ao Dashboard
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODO 1: ANÁLISE DETALHADA POR ESCOLA (LAYOUT EM 2 COLUNAS)                 */}
      {/* ========================================================================= */}
      {viewMode === 'DETAIL' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
          {/* COLUNA ESQUERDA: LISTA DE ESCOLAS */}
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 12px' }}>
            <div>
              <strong style={{ fontSize: 13, color: 'var(--text, #0f172a)' }}>
                Escolas Participantes ({filteredSchools.length})
              </strong>
              <div style={{ marginTop: 6 }}>
                <Input
                  type="search"
                  placeholder="🔍 Buscar escola ou INEP..."
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>

            <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredSchools.map((s) => {
                const isSelected = s.id === selectedSchoolId;
                const turmasCount = s.classes?.length || 0;
                const evaluatedCount = s.realEvaluated || 0;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSchoolId(s.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: isSelected ? '1.5px solid var(--primary, #0284c7)' : '1px solid transparent',
                      background: isSelected ? 'rgba(2, 132, 199, 0.08)' : 'var(--surface-2, #f8fafc)',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: isSelected ? 750 : 600, color: isSelected ? 'var(--primary, #0284c7)' : 'var(--text, #0f172a)', lineHeight: 1.3 }}>
                      {s.name}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 11, color: 'var(--text-3, #94a3b8)' }}>
                      <span className="mono">{s.inep || 's/ INEP'}</span>
                      <span style={{ fontWeight: 600, color: evaluatedCount > 0 ? '#15803d' : '#b45309' }}>
                        {evaluatedCount > 0 ? `${evaluatedCount} avaliados` : `${turmasCount} turmas`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COLUNA DIREITA: PAINEL ANALÍTICO DA ESCOLA SELECIONADA */}
          {selectedSchool ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Card de Cabeçalho da Escola */}
              <div className="card card-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text, #0f172a)', margin: 0 }}>
                      {selectedSchool.name}
                    </h2>
                    <Badge cls={STATUS_MAP[selectedSchool.status]?.cls || 'badge-green'}>
                      {STATUS_MAP[selectedSchool.status]?.label || 'Concluída'}
                    </Badge>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2, #64748b)', marginTop: 4 }}>
                    INEP: <strong className="mono">{selectedSchool.inep || '—'}</strong> · Município: <strong>Abaetetuba/PA</strong> · {selectedSchool.classes?.length || 0} turmas cadastradas
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="secondary" onClick={() => setLinkModal(selectedSchool)}>
                    🔗 Link de Coleta
                  </Button>
                  <Button size="sm" onClick={() => setClassModal(true)}>
                    + Nova Turma
                  </Button>
                </div>
              </div>

              {/* BARRA DE FILTROS ALINHADA EM UMA LINHA SÓ */}
              <div
                className="card card-pad"
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2, #64748b)', textTransform: 'uppercase' }}>
                    Etapa:
                  </span>
                  <Select
                    value={selectedGrade}
                    onChange={(e) => setSelectedGrade(e.target.value)}
                    style={{ fontSize: 12, padding: '4px 10px', height: 32, minWidth: 140 }}
                  >
                    <option value="ALL">Todas as Etapas</option>
                    <option value="0">Educação Infantil (PII)</option>
                    <option value="1">1º Ano do Ensino Fundamental</option>
                    <option value="2">2º Ano do Ensino Fundamental</option>
                  </Select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2, #64748b)', textTransform: 'uppercase' }}>
                    Avaliação:
                  </span>
                  <Select
                    value={selectedAssessment}
                    onChange={(e) => setSelectedAssessment(e.target.value)}
                    style={{ fontSize: 12, padding: '4px 10px', height: 32, minWidth: 150 }}
                  >
                    <option value="ALL">Todas as Avaliações (Última Vigente)</option>
                    <option value="A0">A0 — Diagnóstica</option>
                    <option value="A1">A1 — Formativa 1</option>
                    <option value="A2">A2 — Formativa 2</option>
                    <option value="A3">A3 — Somativa</option>
                  </Select>
                </div>

                <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-2, #64748b)' }}>
                  {selectedAssessment === 'ALL' ? (
                    <span>💡 Consolidado pela <strong>avaliação mais recente</strong> de cada turma</span>
                  ) : (
                    <span>Exibindo dados da avaliação <strong>{selectedAssessment}</strong></span>
                  )}
                </div>
              </div>

              {/* ABAS DE COMPONENTES CURRICULARES */}
              <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border, #e2e8f0)', paddingBottom: 6 }}>
                {COMPONENT_TABS.map((tab) => {
                  const isActive = activeComponent === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveComponent(tab.key)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px 8px 0 0',
                        border: 'none',
                        borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                        background: isActive ? 'var(--surface-2, #f8fafc)' : 'transparent',
                        fontWeight: isActive ? 750 : 500,
                        color: isActive ? tab.color : 'var(--text-2, #64748b)',
                        cursor: 'pointer',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* 4 CARDS DE MÉTRICAS KPI DO COMPONENTE */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                <div style={{ padding: '12px 16px', background: 'var(--surface-2, #f8fafc)', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2, #64748b)', fontWeight: 600 }}>Alunos Matriculados</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                    {fmtInt(componentMetrics.totalEnrolled)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3, #94a3b8)' }}>
                    {selectedAssessment === 'ALL' ? 'Base da última avaliação' : `Filtro em ${selectedAssessment}`}
                  </div>
                </div>

                <div style={{ padding: '12px 16px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: 10, border: '1px solid rgba(2, 132, 199, 0.25)' }}>
                  <div style={{ fontSize: 11.5, color: '#0369a1', fontWeight: 600 }}>Alunos Avaliados</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7' }}>
                    {fmtInt(componentMetrics.totalEvaluated)}
                  </div>
                  <div style={{ fontSize: 11, color: '#0369a1' }}>
                    {selectedAssessment === 'ALL' ? 'Participantes na última etapa' : 'Participantes avaliados'}
                  </div>
                </div>

                <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  <div style={{ fontSize: 11.5, color: '#15803d', fontWeight: 600 }}>Taxa de Participação</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>
                    {fmt(componentMetrics.partRate)}%
                  </div>
                  <div style={{ fontSize: 11, color: '#15803d' }}>
                    {componentMetrics.partRate >= 90 ? 'Excelente cobertura' : 'Abaixo da meta municipal'}
                  </div>
                </div>

                <div style={{ padding: '12px 16px', background: 'var(--surface-2, #f8fafc)', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2, #64748b)', fontWeight: 600 }}>
                    {activeComponent === 'PORTUGUES' ? 'Leitor Fluente (LF)' : activeComponent === 'MATEMATICA' ? 'Proficientes (7 a 10 pts)' : 'Habilidades Desenvolvidas'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text, #0f172a)' }}>
                    {activeComponent === 'PORTUGUES'
                      ? `${componentMetrics.leitura.lf.pct}%`
                      : activeComponent === 'MATEMATICA'
                      ? `${componentMetrics.matematica.p.pct}%`
                      : `${componentMetrics.inicial.d.pct}%`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3, #94a3b8)' }}>Meta da rede: 70%+</div>
                </div>
              </div>

              {/* DISTRIBUIÇÃO VISUAL DE CRITÉRIOS DE DESEMPENHO */}
              {activeComponent === 'PORTUGUES' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  {/* CARD 1: LEITURA */}
                  <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13.5, color: '#0284c7' }}>📖 Leitura (Perfis de Leitor)</strong>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3, #94a3b8)' }}>PL · LI · LF</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: '#b91c1c', fontWeight: 600 }}>Pré-Leitor (PL)</span>
                          <strong>{componentMetrics.leitura.pl.count} alunos ({componentMetrics.leitura.pl.pct}%)</strong>
                        </div>
                        <div style={{ height: 7, background: '#fee2e2', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${componentMetrics.leitura.pl.pct}%`, height: '100%', background: '#ef4444', borderRadius: 4 }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: '#b45309', fontWeight: 600 }}>Leitor Inicial (LI)</span>
                          <strong>{componentMetrics.leitura.li.count} alunos ({componentMetrics.leitura.li.pct}%)</strong>
                        </div>
                        <div style={{ height: 7, background: '#fef3c7', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${componentMetrics.leitura.li.pct}%`, height: '100%', background: '#f59e0b', borderRadius: 4 }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: '#15803d', fontWeight: 600 }}>Leitor Fluente (LF)</span>
                          <strong>{componentMetrics.leitura.lf.count} alunos ({componentMetrics.leitura.lf.pct}%)</strong>
                        </div>
                        <div style={{ height: 7, background: '#dcfce7', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${componentMetrics.leitura.lf.pct}%`, height: '100%', background: '#10b981', borderRadius: 4 }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CARD 2: COMPREENSÃO DE TEXTO */}
                  <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13.5, color: '#0284c7' }}>🧠 Compreensão de Texto</strong>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3, #94a3b8)' }}>NC · CO · CA</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: '#b91c1c', fontWeight: 600 }}>Não Compreende (NC)</span>
                          <strong>{componentMetrics.compreensao.nc.count} alunos ({componentMetrics.compreensao.nc.pct}%)</strong>
                        </div>
                        <div style={{ height: 7, background: '#fee2e2', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${componentMetrics.compreensao.nc.pct}%`, height: '100%', background: '#ef4444', borderRadius: 4 }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: '#b45309', fontWeight: 600 }}>Compreende p/ Oralidade (CO)</span>
                          <strong>{componentMetrics.compreensao.co.count} alunos ({componentMetrics.compreensao.co.pct}%)</strong>
                        </div>
                        <div style={{ height: 7, background: '#fef3c7', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${componentMetrics.compreensao.co.pct}%`, height: '100%', background: '#f59e0b', borderRadius: 4 }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: '#15803d', fontWeight: 600 }}>Compreende Autonomamente (CA)</span>
                          <strong>{componentMetrics.compreensao.ca.count} alunos ({componentMetrics.compreensao.ca.pct}%)</strong>
                        </div>
                        <div style={{ height: 7, background: '#dcfce7', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${componentMetrics.compreensao.ca.pct}%`, height: '100%', background: '#10b981', borderRadius: 4 }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CARD 3: ESCRITA */}
                  <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13.5, color: '#0284c7' }}>✍️ Escrita (Níveis Psicogenéticos)</strong>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3, #94a3b8)' }}>PA · AI · AC</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: '#b91c1c', fontWeight: 600 }}>Pré-Alfabético (PA)</span>
                          <strong>{componentMetrics.escrita.pa.count} alunos ({componentMetrics.escrita.pa.pct}%)</strong>
                        </div>
                        <div style={{ height: 7, background: '#fee2e2', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${componentMetrics.escrita.pa.pct}%`, height: '100%', background: '#ef4444', borderRadius: 4 }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: '#b45309', fontWeight: 600 }}>Alfabético Inicial (AI)</span>
                          <strong>{componentMetrics.escrita.ai.count} alunos ({componentMetrics.escrita.ai.pct}%)</strong>
                        </div>
                        <div style={{ height: 7, background: '#fef3c7', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${componentMetrics.escrita.ai.pct}%`, height: '100%', background: '#f59e0b', borderRadius: 4 }} />
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ color: '#15803d', fontWeight: 600 }}>Alfabético Completo (AC)</span>
                          <strong>{componentMetrics.escrita.ac.count} alunos ({componentMetrics.escrita.ac.pct}%)</strong>
                        </div>
                        <div style={{ height: 7, background: '#dcfce7', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${componentMetrics.escrita.ac.pct}%`, height: '100%', background: '#10b981', borderRadius: 4 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeComponent === 'MATEMATICA' && (
                <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 14, color: '#7c3aed' }}>📐 Proficiência em Matemática</strong>
                    <span style={{ fontSize: 11.5, color: 'var(--text-3, #94a3b8)' }}>NP · PI · P</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                    <div style={{ padding: '12px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                        <span style={{ color: '#991b1b', fontWeight: 700 }}>Não Proficiente (NP — Até 4 pts)</span>
                        <strong>{componentMetrics.matematica.np.count} alunos ({componentMetrics.matematica.np.pct}%)</strong>
                      </div>
                      <div style={{ height: 8, background: '#fee2e2', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${componentMetrics.matematica.np.pct}%`, height: '100%', background: '#dc2626', borderRadius: 4 }} />
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                        <span style={{ color: '#92400e', fontWeight: 700 }}>Proficiente Inicial (PI — 5 a 6 pts)</span>
                        <strong>{componentMetrics.matematica.pi.count} alunos ({componentMetrics.matematica.pi.pct}%)</strong>
                      </div>
                      <div style={{ height: 8, background: '#fef3c7', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${componentMetrics.matematica.pi.pct}%`, height: '100%', background: '#d97706', borderRadius: 4 }} />
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                        <span style={{ color: '#166534', fontWeight: 700 }}>Proficiente (P — 7 a 10 pts)</span>
                        <strong>{componentMetrics.matematica.p.count} alunos ({componentMetrics.matematica.p.pct}%)</strong>
                      </div>
                      <div style={{ height: 8, background: '#dcfce7', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${componentMetrics.matematica.p.pct}%`, height: '100%', background: '#16a34a', borderRadius: 4 }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TABELA DE DESEMPENHO POR TURMA */}
              <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13.5, color: 'var(--text, #0f172a)' }}>
                    Detalhamento por Turma — {selectedSchool.name} ({componentMetrics.matchingAssessmentsList.length} registros)
                  </strong>
                </div>

                {componentMetrics.matchingAssessmentsList.length === 0 ? (
                  <div className="alert alert-info" style={{ fontSize: 12.5 }}>
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-2, #f8fafc)', borderBottom: '1px solid var(--border, #e2e8f0)', color: 'var(--text-2, #475569)' }}>
                          <th style={{ padding: '8px 12px', fontWeight: 700 }}>Turma & Turno</th>
                          <th style={{ padding: '8px 12px', fontWeight: 700, width: 110, textAlign: 'center' }}>Avaliação</th>
                          <th style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'center', width: 90 }}>Mat / Aval</th>
                          <th style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'center', width: 85 }}>Part. (%)</th>
                          <th style={{ padding: '8px 12px', fontWeight: 700 }}>Distribuição de Desempenho</th>
                          <th style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'center', width: 90 }}>Status</th>
                          <th style={{ padding: '8px 12px', fontWeight: 700, textAlign: 'center', width: 80 }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {componentMetrics.matchingAssessmentsList.map(({ classInfo, assessment, component, isLatest }, idx) => {
                          const partPct = component.enrolled > 0
                            ? Math.round((component.evaluated / component.enrolled) * 1000) / 10
                            : 100;

                          return (
                            <tr
                              key={`${classInfo.id}_${assessment.code}_${idx}`}
                              style={{
                                borderBottom: '1px solid var(--border, #f1f5f9)',
                                background: isLatest && selectedAssessment === 'ALL' ? 'rgba(2, 132, 199, 0.03)' : 'transparent',
                              }}
                            >
                              <td style={{ padding: '8px 12px' }}>
                                <strong>{formatGradeLabel(classInfo.grade)}</strong> · Turma {classInfo.name} ({classInfo.shift === 'M' ? 'Manhã' : 'Tarde'})
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4, fontWeight: 800, fontSize: 11 }}>
                                    {assessment.code}
                                  </span>
                                  {isLatest && selectedAssessment === 'ALL' && (
                                    <span
                                      style={{
                                        background: '#dcfce7',
                                        color: '#15803d',
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        fontSize: 9.5,
                                        fontWeight: 800,
                                      }}
                                      title="Avaliação mais recente contabilizada no resumo"
                                    >
                                      Atual
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>
                                {component.enrolled} / <strong>{component.evaluated}</strong>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: partPct >= 90 ? '#15803d' : '#b45309' }}>
                                {fmt(partPct)}%
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                {renderResultsBreakdown(component.results, activeComponent)}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <Badge cls={assessment.status === 'ENVIADO' ? 'badge-green' : 'badge-yellow'}>
                                  {assessment.status === 'ENVIADO' ? '🟢 Enviado' : '🟡 Rascunho'}
                                </Badge>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                  {assessment.status === 'ENVIADO' && (
                                    <button
                                      type="button"
                                      onClick={() => handleReopenAssessment(assessment.id)}
                                      disabled={isProcessing}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                                      title="Reabrir avaliação"
                                    >
                                      🔓
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setDeletingAssessment(assessment)}
                                    disabled={isProcessing}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                                    title="Excluir avaliação"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card card-pad" style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
              Selecione uma escola na lista ao lado para visualizar o painel de resultados.
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODO 2: GESTÃO GERAL DE RESULTADOS DA REDE (VISÃO EM LOTE)                 */}
      {/* ========================================================================= */}
      {viewMode === 'MANAGE' && (
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* BARRA DE FILTROS ALINHADA EM UMA LINHA SÓ */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              paddingBottom: 10,
              borderBottom: '1px solid var(--border, #e2e8f0)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2, #64748b)', textTransform: 'uppercase' }}>
                Componente:
              </span>
              <Select
                value={manageComponent}
                onChange={(e) => setManageComponent(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', height: 32, minWidth: 140 }}
              >
                <option value="TODOS">Todos os Componentes</option>
                <option value="PORTUGUES">Língua Portuguesa</option>
                <option value="MATEMATICA">Matemática</option>
                <option value="INICIAL">Habilidades Iniciais</option>
              </Select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2, #64748b)', textTransform: 'uppercase' }}>
                Etapa:
              </span>
              <Select
                value={manageGrade}
                onChange={(e) => setManageGrade(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', height: 32, minWidth: 120 }}
              >
                <option value="TODOS">Todas as Etapas</option>
                <option value="0">PII</option>
                <option value="1">1º Ano</option>
                <option value="2">2º Ano</option>
              </Select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2, #64748b)', textTransform: 'uppercase' }}>
                Avaliação:
              </span>
              <Select
                value={manageAssessment}
                onChange={(e) => setManageAssessment(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', height: 32, minWidth: 120 }}
              >
                <option value="TODOS">Todas</option>
                <option value="A0">A0</option>
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="A3">A3</option>
              </Select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-2, #64748b)', textTransform: 'uppercase' }}>
                Status:
              </span>
              <Select
                value={manageStatus}
                onChange={(e) => setManageStatus(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', height: 32, minWidth: 110 }}
              >
                <option value="ALL">Todos</option>
                <option value="ENVIADO">Enviados</option>
                <option value="RASCUNHO">Rascunhos</option>
              </Select>
            </div>

            <div style={{ marginLeft: 'auto', width: 240 }}>
              <Input
                type="search"
                placeholder="🔍 Filtrar escola/turma..."
                value={manageSearch}
                onChange={(e) => setManageSearch(e.target.value)}
                style={{ fontSize: 12, height: 32 }}
              />
            </div>
          </div>

          {/* BARRA DE AÇÕES EM LOTE */}
          {selectedAssessmentIds.size > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 14px',
                background: 'rgba(2, 132, 199, 0.08)',
                borderRadius: 8,
                border: '1px solid rgba(2, 132, 199, 0.25)',
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0369a1' }}>
                {selectedAssessmentIds.size} avaliações selecionadas
              </span>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleBulkDelete}
                  disabled={isProcessing}
                  style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}
                >
                  🗑️ Excluir Selecionadas ({selectedAssessmentIds.size})
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectedAssessmentIds(new Set())}
                >
                  Desmarcar
                </Button>
              </div>
            </div>
          )}

          {/* TABELA DE GESTÃO GERAL */}
          {allManagedAssessments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
              Nenhum resultado encontrado para os filtros selecionados.
            </div>
          ) : (
            <div style={{ maxHeight: 540, overflowY: 'auto', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface-2, #f8fafc)', borderBottom: '2px solid var(--border, #e2e8f0)' }}>
                    <th style={{ padding: '8px 12px', width: 35, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={allManagedAssessments.length > 0 && selectedAssessmentIds.size === allManagedAssessments.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th style={{ padding: '8px 12px', width: 90 }}>Status</th>
                    <th style={{ padding: '8px 12px', width: 95 }}>INEP</th>
                    <th style={{ padding: '8px 12px' }}>Escola Municipal</th>
                    <th style={{ padding: '8px 12px', width: 130 }}>Componente</th>
                    <th style={{ padding: '8px 12px', width: 110 }}>Etapa & Turma</th>
                    <th style={{ padding: '8px 12px', width: 65, textAlign: 'center' }}>Aval.</th>
                    <th style={{ padding: '8px 12px', width: 90, textAlign: 'center' }}>Mat / Aval</th>
                    <th style={{ padding: '8px 12px', width: 85, textAlign: 'center' }}>Part. (%)</th>
                    <th style={{ padding: '8px 12px', width: 75, textAlign: 'center' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {allManagedAssessments.map((r, rowIdx) => {
                    const isSelected = selectedAssessmentIds.has(r.assessmentId);
                    const partPct = r.enrolled > 0 ? Math.round((r.evaluated / r.enrolled) * 1000) / 10 : 100;
                    return (
                      <tr
                        key={r.id}
                        style={{
                          background: isSelected ? 'rgba(2, 132, 199, 0.08)' : rowIdx % 2 === 0 ? 'transparent' : 'var(--surface-2, rgba(0,0,0,0.01))',
                          borderBottom: '1px solid var(--border, #f1f5f9)',
                        }}
                      >
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(r.assessmentId)}
                          />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <Badge cls={r.status === 'ENVIADO' ? 'badge-green' : 'badge-yellow'}>
                            {r.status === 'ENVIADO' ? '🟢 Oficial' : '🟡 Rascunho'}
                          </Badge>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className="mono" style={{ color: '#0284c7', fontWeight: 600 }}>{r.schoolInep || '—'}</span>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                          {r.schoolName}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            style={{
                              background: r.component === 'PORTUGUES' ? 'rgba(2, 132, 199, 0.12)' : 'rgba(124, 58, 237, 0.12)',
                              color: r.component === 'PORTUGUES' ? '#0284c7' : '#7c3aed',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontWeight: 700,
                              fontSize: 11,
                            }}
                          >
                            {r.component === 'PORTUGUES' ? '📖 Português' : r.component === 'MATEMATICA' ? '📐 Matemática' : '👶 Inicial'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {formatGradeLabel(r.grade)} · Turma {r.className} ({r.shift})
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '1px 5px', borderRadius: 4, fontWeight: 800, fontSize: 11 }}>
                            {r.assessmentCode}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>
                          {r.enrolled} / <strong>{r.evaluated}</strong>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: partPct >= 90 ? '#15803d' : '#b45309' }}>
                          {fmt(partPct)}%
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            {r.status === 'ENVIADO' && (
                              <button
                                type="button"
                                onClick={() => handleReopenAssessment(r.assessmentId)}
                                disabled={isProcessing}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                                title="Reabrir avaliação"
                              >
                                🔓
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeletingAssessment(r)}
                              disabled={isProcessing}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                              title="Excluir avaliação"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CONFIRMAR EXCLUSÃO INDIVIDUAL */}
      {deletingAssessment && (
        <Modal
          open={Boolean(deletingAssessment)}
          onClose={() => setDeletingAssessment(null)}
          title="Confirmar Exclusão de Avaliação"
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeletingAssessment(null)} disabled={isProcessing}>
                Cancelar
              </Button>
              <Button
                variant="secondary"
                onClick={handleDeleteAssessment}
                disabled={isProcessing}
                style={{ background: '#dc2626', color: '#ffffff', borderColor: '#dc2626' }}
              >
                {isProcessing ? 'Excluindo...' : 'Sim, Excluir Avaliação'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              Tem certeza que deseja excluir esta avaliação de <strong>{deletingAssessment.schoolName || selectedSchool?.name}</strong>?
            </p>
            <div style={{ background: 'var(--surface-2, #f8fafc)', padding: 12, borderRadius: 8, border: '1px solid var(--border, #e2e8f0)', fontSize: 12.5 }}>
              <div><strong>Escola:</strong> {deletingAssessment.schoolName || selectedSchool?.name}</div>
              <div><strong>Turma:</strong> Turma {deletingAssessment.className || deletingAssessment.classInfo?.name}</div>
              <div><strong>Avaliação:</strong> {deletingAssessment.assessmentCode || deletingAssessment.code}</div>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>
              Esta ação removerá os lançamentos e atualizará os indicadores do Pacto imediatamente.
            </p>
          </div>
        </Modal>
      )}

      {/* MODAL: LINK EXCLUSIVO DE COLETA */}
      <Modal
        open={Boolean(linkModal)}
        onClose={() => { setLinkModal(null); setGeneratedLink(null); }}
        title={`Link de Coleta — ${linkModal?.name || ''}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setLinkModal(null); setGeneratedLink(null); }}>Fechar</Button>
            {!generatedLink && <Button onClick={generateLink} disabled={isProcessing}>{isProcessing ? 'Gerando...' : 'Gerar Link'}</Button>}
          </>
        }
      >
        {generatedLink ? (
          <div>
            <div className="alert alert-success" style={{ marginBottom: 12 }}>
              Link exclusivo verificado para <strong>{linkModal?.name}</strong>.
            </div>
            <Field label="Endereço exclusivo de coleta">
              <div style={{ display: 'flex', gap: 8 }}>
                <Input value={generatedLink} readOnly />
                <Button onClick={copyLink}>Copiar</Button>
              </div>
            </Field>
          </div>
        ) : (
          <Field label="Válido até" required>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
        )}
      </Modal>

      {/* MODAL: CADASTRO DE NOVA TURMA */}
      <Modal
        open={classModal}
        onClose={() => setClassModal(false)}
        title={`Cadastrar Turma — ${selectedSchool?.name || ''}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClassModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveClass} disabled={isProcessing || !classForm.name.trim()}>
              {isProcessing ? 'Salvando...' : 'Cadastrar Turma'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveClass} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Etapa / Ano" required>
            <Select value={classForm.grade} onChange={(e) => setClassForm((f) => ({ ...f, grade: Number(e.target.value) }))}>
              <option value="0">Educação Infantil (PII)</option>
              <option value="1">1º Ano do Ensino Fundamental</option>
              <option value="2">2º Ano do Ensino Fundamental</option>
            </Select>
          </Field>
          <Field label="Turno" required>
            <Select value={classForm.shift} onChange={(e) => setClassForm((f) => ({ ...f, shift: e.target.value }))}>
              <option value="M">Manhã (M)</option>
              <option value="T">Tarde (T)</option>
            </Select>
          </Field>
          <Field label="Identificação da Turma (Letra ou Nome)" required hint="Ex.: A, B, C, Única">
            <Input
              value={classForm.name}
              maxLength={30}
              placeholder="Ex.: A"
              onChange={(e) => setClassForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
