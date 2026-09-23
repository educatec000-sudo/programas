import React, { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import DataTable from '../components/DataTable.jsx';
import { useApi, useDebounce } from '../hooks/useApi.js';
import { enrollmentApi, schoolsApi } from '../services/resources.js';
import { useToast } from '../contexts/ToastContext.jsx';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Tabs,
  Textarea,
} from '../components/ui.jsx';
import { fmtDate, fmtDateTime, fmtInt, fmtPct, IMPORT_STATUS, ROW_STATUS, SCHOOL_ZONE } from '../utils/format.js';

const currentYear = new Date().getFullYear();

const schoolsTableShellStyle = {
  border: '1px solid #d8e1ee',
  borderRadius: 14,
  background: '#ffffff',
  overflow: 'hidden',
  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
};

const schoolsHeaderCellStyle = {
  background: '#f5f7fb',
  color: '#94a3b8',
  fontSize: 11.5,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const schoolsCellStyle = {
  paddingTop: 13,
  paddingBottom: 13,
};

function tonesForRun(mode) {
  return mode === 'SIMULACAO' ? 'badge-purple' : 'badge-blue';
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createEmptyDashboardFilters() {
  return {
    schoolQuery: '',
    zone: [],
    shift: [],
    classStageRaw: [],
    classLabel: [],
    enrollmentStageRaw: [],
  };
}

function createStageComparisonFilters() {
  return {
    schoolQuery: '',
    zone: [],
    classStageRaw: [],
    enrollmentStageRaw: [],
  };
}

export default function EnrollmentProspection() {
  const { success, error, toast } = useToast();
  const [tab, setTab] = useState('dashboard');
  const [baseYear, setBaseYear] = useState(currentYear);
  const [projectedYear, setProjectedYear] = useState(currentYear + 1);
  const [selectedRunId, setSelectedRunId] = useState('');

  const [schoolSearch, setSchoolSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [dashboardFilters, setDashboardFilters] = useState(createEmptyDashboardFilters);
  const [stageCompareFiltersA, setStageCompareFiltersA] = useState(createStageComparisonFilters);
  const [stageCompareFiltersB, setStageCompareFiltersB] = useState(createStageComparisonFilters);
  const debouncedSchoolSearch = useDebounce(schoolSearch, 250);

  const [preview, setPreview] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importNotes, setImportNotes] = useState('');
  const fileRef = useRef(null);

  const [rulesDraft, setRulesDraft] = useState([]);
  const [rulesMeta, setRulesMeta] = useState({ id: '', name: '', notes: '' });
  const [settingsBusy, setSettingsBusy] = useState(false);

  const [schoolSettingOpen, setSchoolSettingOpen] = useState(false);
  const [schoolSettingBusy, setSchoolSettingBusy] = useState(false);
  const [schoolSettingForm, setSchoolSettingForm] = useState({
    schoolId: '',
    projectedYear: currentYear + 1,
    entryStageCode: '',
    notes: '',
    capacityOverrides: {},
  });

  const [detailSchoolId, setDetailSchoolId] = useState(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simSchoolId, setSimSchoolId] = useState('');
  const [simStageCode, setSimStageCode] = useState('');
  const [simDelta, setSimDelta] = useState(0);
  const [simNotes, setSimNotes] = useState('');
  const [lastRunResult, setLastRunResult] = useState(null);
  const [confirmOfficialOpen, setConfirmOfficialOpen] = useState(false);

  const overviewDeps = [baseYear, projectedYear];
  const { data: overview, loading: overviewLoading, error: overviewError, refresh: refreshOverview } = useApi(
    () => enrollmentApi.overview({ baseYear, projectedYear }),
    overviewDeps,
    { cacheKey: `enrollment-overview-${baseYear}-${projectedYear}` },
  );

  const { data: settingsData, loading: settingsLoading, refresh: refreshSettings } = useApi(
    () => enrollmentApi.settings({ baseYear, projectedYear }),
    overviewDeps,
    { cacheKey: `enrollment-settings-${baseYear}-${projectedYear}` },
  );

  const { data: schoolsProjection, loading: schoolsLoading, refresh: refreshSchools } = useApi(
    () => enrollmentApi.schools({
      baseYear,
      projectedYear,
      runId: selectedRunId || undefined,
      search: debouncedSchoolSearch,
      zone: zoneFilter || undefined,
    }),
    [baseYear, projectedYear, selectedRunId, debouncedSchoolSearch, zoneFilter],
    { cacheKey: `enrollment-schools-${baseYear}-${projectedYear}-${selectedRunId}-${debouncedSchoolSearch}-${zoneFilter}` },
  );

  const { data: schoolCatalog } = useApi(
    () => schoolsApi.list({ page: 1, pageSize: 1000, sort: 'name', dir: 'asc' }),
    [],
    { cacheKey: 'enrollment-school-catalog' },
  );

  const { data: schoolDetail, loading: detailLoading, refresh: refreshDetail } = useApi(
    () => (detailSchoolId
      ? enrollmentApi.schoolDetail(detailSchoolId, { baseYear, projectedYear, runId: selectedRunId || undefined })
      : Promise.resolve(null)),
    [detailSchoolId, baseYear, projectedYear, selectedRunId],
    { immediate: Boolean(detailSchoolId), cacheKey: detailSchoolId ? `enrollment-school-detail-${detailSchoolId}-${baseYear}-${projectedYear}-${selectedRunId}` : null },
  );

  useEffect(() => {
    if (!settingsData?.ruleSet) return;
    setRulesMeta({
      id: settingsData.ruleSet.id,
      name: settingsData.ruleSet.name,
      notes: settingsData.ruleSet.notes || '',
    });
    setRulesDraft(settingsData.ruleSet.items.map((item) => ({ ...item })));
    setSchoolSettingForm((form) => ({ ...form, projectedYear }));
  }, [settingsData, projectedYear]);

  const schoolOptions = schoolCatalog?.data || [];
  const runOptions = overview?.runs || [];
  const detailEntryStageCode = schoolDetail?.planningSummary?.entryStageCode || schoolDetail?.setting?.entryStageCode || '';
  const detailEntryRow = schoolDetail ? getEntryStageRow(schoolDetail.stageRows, schoolDetail.planningSummary) : null;
  const activeRun = schoolsProjection?.run || overview?.latestOfficialRun || overview?.latestSimulationRun || null;

  const schoolMap = useMemo(
    () => new Map(schoolOptions.map((school) => [school.id, school])),
    [schoolOptions],
  );

  const dashboardRecordRows = useMemo(
    () => buildDashboardRecordRows(overview?.records || [], schoolMap, settingsData?.stages || []),
    [overview?.records, schoolMap, settingsData?.stages],
  );

  const dashboardFilterOptions = useMemo(
    () => buildDashboardFilterOptions(dashboardRecordRows, dashboardFilters),
    [dashboardRecordRows, dashboardFilters],
  );

  const dashboardFilteredRows = useMemo(
    () => applyDashboardFilters(dashboardRecordRows, dashboardFilters),
    [dashboardRecordRows, dashboardFilters],
  );

  const dashboardFilterSummary = useMemo(
    () => summarizeFilteredDashboardRows(dashboardFilteredRows),
    [dashboardFilteredRows],
  );

  const stageCompareOptionsA = useMemo(
    () => buildDashboardFilterOptions(dashboardRecordRows, stageCompareFiltersA),
    [dashboardRecordRows, stageCompareFiltersA],
  );

  const stageCompareOptionsB = useMemo(
    () => buildDashboardFilterOptions(dashboardRecordRows, stageCompareFiltersB),
    [dashboardRecordRows, stageCompareFiltersB],
  );

  const stageCompareRowsA = useMemo(
    () => applyDashboardFilters(dashboardRecordRows, stageCompareFiltersA),
    [dashboardRecordRows, stageCompareFiltersA],
  );

  const stageCompareRowsB = useMemo(
    () => applyDashboardFilters(dashboardRecordRows, stageCompareFiltersB),
    [dashboardRecordRows, stageCompareFiltersB],
  );

  const stageCompareSummaryA = useMemo(
    () => summarizeFilteredDashboardRows(stageCompareRowsA),
    [stageCompareRowsA],
  );

  const stageCompareSummaryB = useMemo(
    () => summarizeFilteredDashboardRows(stageCompareRowsB),
    [stageCompareRowsB],
  );

  const stageCompareTableRowsA = useMemo(
    () => buildStageComparisonTableRows(stageCompareRowsA),
    [stageCompareRowsA],
  );

  const stageCompareTableRowsB = useMemo(
    () => buildStageComparisonTableRows(stageCompareRowsB),
    [stageCompareRowsB],
  );

  const dashboardChartGroups = useMemo(
    () => buildDashboardChartGroups(overview?.stageSummary || []),
    [overview?.stageSummary],
  );

  const schoolsTabSummary = useMemo(
    () => summarizeSchoolPlanningRows(schoolsProjection?.data || []),
    [schoolsProjection?.data],
  );

  const syncAll = () => {
    refreshOverview();
    refreshSettings();
    refreshSchools();
    if (detailSchoolId) refreshDetail();
  };

  const handleSelectFile = () => fileRef.current?.click();

  const handlePreviewImport = async (file) => {
    if (!file) return;
    setImportBusy(true);
    try {
      const result = await enrollmentApi.previewImport(file, {
        referenceYear: baseYear,
        targetYear: projectedYear,
        notes: importNotes,
      });
      setPreview(result);
      toast('Prévia gerada. Revise as linhas antes de confirmar a base oficial.', { type: 'info', title: 'Importação analisada' });
    } catch (err) {
      error(err.message);
    } finally {
      setImportBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview?.id) return;
    setImportBusy(true);
    try {
      const result = await enrollmentApi.confirmImport({
        jobId: preview.id,
        notes: importNotes,
        publishAsOfficial: true,
      });
      success(`Base ${baseYear} confirmada com ${result.created} linha(s) válidas.`);
      setPreview(null);
      syncAll();
    } catch (err) {
      error(err.message);
    } finally {
      setImportBusy(false);
    }
  };

  const handleRuleChange = (stageCode, key, value) => {
    setRulesDraft((draft) => draft.map((item) => (item.stageCode === stageCode ? { ...item, [key]: value } : item)));
  };

  const handleSaveRules = async () => {
    setSettingsBusy(true);
    try {
      await enrollmentApi.updateRules({
        ruleSetId: rulesMeta.id || undefined,
        name: rulesMeta.name,
        notes: rulesMeta.notes,
        baseYear,
        projectedYear,
        items: rulesDraft.map((item) => ({
          ...item,
          promotionRate: safeNumber(item.promotionRate),
          repetitionRate: safeNumber(item.repetitionRate),
          dropoutRate: safeNumber(item.dropoutRate),
          entryRate: safeNumber(item.entryRate, 100),
          capacityLimit: item.capacityLimit === '' || item.capacityLimit == null ? null : safeNumber(item.capacityLimit),
        })),
      });
      success('Regras de projeção atualizadas.');
      syncAll();
    } catch (err) {
      error(err.message);
    } finally {
      setSettingsBusy(false);
    }
  };

  const openSchoolSettingModal = (setting = null) => {
    if (setting) {
      setSchoolSettingForm({
        schoolId: setting.schoolId,
        projectedYear: setting.projectedYear,
        entryStageCode: setting.entryStageCode || '',
        notes: setting.notes || '',
        capacityOverrides: { ...(setting.capacityOverrides || {}) },
      });
    } else {
      setSchoolSettingForm({
        schoolId: '',
        projectedYear,
        entryStageCode: '',
        notes: '',
        capacityOverrides: {},
      });
    }
    setSchoolSettingOpen(true);
  };

  const handleSaveSchoolSetting = async () => {
    if (!schoolSettingForm.schoolId) {
      error('Selecione a escola.');
      return;
    }
    setSchoolSettingBusy(true);
    try {
      await enrollmentApi.updateSchoolSetting(schoolSettingForm.schoolId, {
        projectedYear: schoolSettingForm.projectedYear,
        entryStageCode: schoolSettingForm.entryStageCode || null,
        notes: schoolSettingForm.notes,
        capacityOverrides: schoolSettingForm.capacityOverrides,
      });
      success('Configuração da escola atualizada.');
      setSchoolSettingOpen(false);
      syncAll();
    } catch (err) {
      error(err.message);
    } finally {
      setSchoolSettingBusy(false);
    }
  };

  const executeSimulation = async () => {
    setSimBusy(true);
    try {
      const adjustments = simSchoolId && simStageCode
        ? [{ schoolId: simSchoolId, stageCode: simStageCode, delta: safeNumber(simDelta) }]
        : [];
      const result = await enrollmentApi.runProjection({
        baseYear,
        projectedYear,
        mode: 'SIMULACAO',
        notes: simNotes,
        adjustments,
      });
      setLastRunResult(result);
      success('Simulação executada e registrada.');
      setSelectedRunId(result.id);
      syncAll();
    } catch (err) {
      error(err.message);
    } finally {
      setSimBusy(false);
    }
  };

  const executeOfficialRun = async () => {
    setSimBusy(true);
    try {
      const result = await enrollmentApi.runProjection({
        baseYear,
        projectedYear,
        mode: 'OFICIAL',
        notes: simNotes,
      });
      setLastRunResult(result);
      success('Projeção oficial executada com sucesso.');
      setSelectedRunId(result.id);
      setConfirmOfficialOpen(false);
      syncAll();
    } catch (err) {
      error(err.message);
    } finally {
      setSimBusy(false);
    }
  };

  const stageColumns = useMemo(() => [
    { key: 'stageLabel', label: 'Etapa', render: (row) => <strong>{row.stageLabel}</strong> },
    { key: 'segment', label: 'Segmento' },
    { key: 'currentStudents', label: `Base ${baseYear}`, align: 'right', render: (row) => fmtInt(row.currentStudents) },
    { key: 'projectedStudents', label: `Demanda ${projectedYear}`, align: 'right', render: (row) => fmtInt(row.projectedStudents) },
  ], [baseYear, projectedYear]);

  const schoolColumns = useMemo(() => [
    { key: 'inep', label: 'INEP', render: (row) => <span className="mono">{row.inep || '—'}</span>, width: 110 },
    { key: 'name', label: 'Escola', render: (row) => <strong>{row.name}</strong> },
    {
      key: 'zone',
      label: 'Zona',
      render: (row) => {
        const info = SCHOOL_ZONE[row.zone];
        return info ? <Badge cls={info.cls}>{info.label}</Badge> : '—';
      },
    },
    { key: 'currentStudents', label: 'Base', align: 'right', render: (row) => fmtInt(row.currentStudents) },
    { key: 'projectedStudents', label: 'Projetado', align: 'right', render: (row) => fmtInt(row.projectedStudents) },
    {
      key: 'deltaStudents',
      label: 'Variação',
      align: 'right',
      render: (row) => (
        <span style={{ color: row.deltaStudents >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
          {row.deltaStudents >= 0 ? '+' : ''}{fmtInt(row.deltaStudents)}
        </span>
      ),
    },
    { key: 'projectedClasses', label: 'Turmas proj.', align: 'right', render: (row) => fmtInt(row.projectedClasses) },
  ], []);

  return (
    <>
      <PageHeader
        title="Prospecção de Matrículas 2027"
        subtitle="Importação histórica oficial, projeção da continuidade e cálculo de matrículas novas na primeira etapa de cada escola"
        badge="CPE · Módulo integrado de matrícula"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Field label="Ano-base" className="field-inline-tight">
              <Select value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value))}>
                {yearOptions().map((year) => <option key={year} value={year}>{year}</option>)}
              </Select>
            </Field>
            <Field label="Ano projetado" className="field-inline-tight">
              <Select value={projectedYear} onChange={(e) => setProjectedYear(Number(e.target.value))}>
                {yearOptions().map((year) => <option key={year} value={year}>{year}</option>)}
              </Select>
            </Field>
          </div>
        }
      />

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'dashboard', label: 'Dashboard' },
          { key: 'escolas', label: 'Escolas', count: schoolsProjection?.data?.length },
          { key: 'configuracoes', label: 'Configurações' },
          { key: 'simulador', label: 'Simulador' },
          { key: 'relatorios', label: 'Relatórios' },
          { key: 'importacao', label: 'Importação / Histórico', count: overview?.datasets?.length },
        ]}
      />

      {tab === 'dashboard' && (
        <>
          {overviewLoading && <LoadingBlock />}
          {overviewError && <Alert type="error">{overviewError.message}</Alert>}
          {!overviewLoading && overview && (
            <div style={{ display: 'grid', gap: 14 }}>
              {overview.alert && <Alert type="warn">{overview.alert}</Alert>}

              <TeachingStageChartsSection chartGroups={dashboardChartGroups} baseYear={baseYear} projectedYear={projectedYear} />

              <div className="card card-pad">
                <div className="card-title">Filtros</div>
                <div className="card-subtitle">Use os filtros para detalhar os dados da base atual no quadro abaixo.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(180px, 1fr))', gap: 10, marginTop: 8 }}>
                  <Field label="ESCOLA / INEP" className="field-inline-tight">
                    <>
                      <Input
                        list="dashboard-school-options"
                        value={dashboardFilters.schoolQuery}
                        onChange={(e) => setDashboardFilters((filters) => ({ ...filters, schoolQuery: e.target.value }))}
                        placeholder="Digite escola ou INEP"
                      />
                      <datalist id="dashboard-school-options">
                        {dashboardFilterOptions.schoolQuery.map((option) => <option key={option.value} value={option.label} />)}
                      </datalist>
                    </>
                  </Field>
                  <Field label="ZONA" className="field-inline-tight">
                    <FilterMultiSelect
                      options={dashboardFilterOptions.zone}
                      selectedValues={dashboardFilters.zone}
                      onChange={(values) => setDashboardFilters((filters) => ({ ...filters, zone: values }))}
                      placeholder="Todas as zonas"
                    />
                  </Field>
                  <Field label="TURNO" className="field-inline-tight">
                    <FilterMultiSelect
                      options={dashboardFilterOptions.shift}
                      selectedValues={dashboardFilters.shift}
                      onChange={(values) => setDashboardFilters((filters) => ({ ...filters, shift: values }))}
                      placeholder="Todos os turnos"
                    />
                  </Field>
                  <Field label="ETAPA TURMA" className="field-inline-tight">
                    <FilterMultiSelect
                      options={dashboardFilterOptions.classStageRaw}
                      selectedValues={dashboardFilters.classStageRaw}
                      onChange={(values) => setDashboardFilters((filters) => ({ ...filters, classStageRaw: values }))}
                      placeholder="Todas as etapas de turma"
                    />
                  </Field>
                  <Field label="TURMA" className="field-inline-tight">
                    <FilterMultiSelect
                      options={dashboardFilterOptions.classLabel}
                      selectedValues={dashboardFilters.classLabel}
                      onChange={(values) => setDashboardFilters((filters) => ({ ...filters, classLabel: values }))}
                      placeholder="Todas as turmas"
                    />
                  </Field>
                  <Field label="ETAPA MATRÍCULA" className="field-inline-tight">
                    <FilterMultiSelect
                      options={dashboardFilterOptions.enrollmentStageRaw}
                      selectedValues={dashboardFilters.enrollmentStageRaw}
                      onChange={(values) => setDashboardFilters((filters) => ({ ...filters, enrollmentStageRaw: values }))}
                      placeholder="Todas as etapas de matrícula"
                    />
                  </Field>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <div className="card-subtitle" style={{ marginBottom: 0 }}>
                    Contagem total de alunos: <strong>{fmtInt(dashboardFilterSummary.totalStudents)}</strong>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDashboardFilters(createEmptyDashboardFilters())}
                  >
                    Limpar filtros
                  </Button>
                </div>
              </div>

              <div className="card card-pad">
                <div className="card-title">Resultado dos filtros</div>
                <div className="card-subtitle">Resumo e detalhamento das matrículas conforme os filtros selecionados.</div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {buildDashboardActiveFilterChips(dashboardFilters, dashboardFilterOptions).map((item) => (
                    <Badge key={`${item.label}-${item.value}`} cls="badge-blue">{item.label}: {item.value}</Badge>
                  ))}
                  {!hasDashboardFilters(dashboardFilters) && <Badge cls="badge-gray">Sem filtros aplicados</Badge>}
                </div>

                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 14, marginBottom: 14 }}>
                  <DashboardMetricCard icon="🏫" title="Escolas encontradas" value={fmtInt(dashboardFilterSummary.totalSchools)} description="Escolas dentro do filtro atual" tone="blue" />
                  <DashboardMetricCard icon="👥" title="Alunos encontrados" value={fmtInt(dashboardFilterSummary.totalStudents)} description="Soma dos alunos filtrados" tone="green" />
                  <DashboardMetricCard icon="🏷️" title="Turmas encontradas" value={fmtInt(dashboardFilterSummary.totalClasses)} description="Turmas distintas no resultado" tone="orange" />
                  <DashboardMetricCard icon="📚" title="Etapas encontradas" value={fmtInt(dashboardFilterSummary.totalEnrollmentStages)} description="Etapas de matrícula no resultado" tone="violet" />
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <div style={{ maxHeight: 560, overflowY: 'auto', border: '1px solid #dbe3f1', borderRadius: 14 }}>
                    <table className="data-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>INEP ESC</th>
                          <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>ESCOLA</th>
                          <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>ETAPA TURMA</th>
                          <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>TURMA</th>
                          <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>TURNO</th>
                          <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>ETAPA MATRÍCULA</th>
                          <th className="num" style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1, textAlign: 'right' }}>CONTAGEM TOTAL DE ALUNOS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardFilteredRows.map((row) => (
                          <tr key={row.id}>
                            <td style={schoolsCellStyle}><span className="mono">{row.inep || '—'}</span></td>
                            <td style={schoolsCellStyle}><strong>{row.schoolName}</strong></td>
                            <td style={schoolsCellStyle}>{row.classStageRaw || '—'}</td>
                            <td style={schoolsCellStyle}>{row.classLabel || '—'}</td>
                            <td style={schoolsCellStyle}>{row.shift || '—'}</td>
                            <td style={schoolsCellStyle}>{row.enrollmentStageRaw || row.stageLabel || '—'}</td>
                            <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right' }}>{fmtInt(row.studentsCount)}</td>
                          </tr>
                        ))}
                        {!dashboardFilteredRows.length && (
                          <tr>
                            <td colSpan={7} style={{ padding: 24 }}>
                              <EmptyState icon="📋" title="Nenhum registro encontrado" hint="Ajuste os filtros para visualizar os registros da base atual." />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <StageComparisonSection
                panelA={{
                  panelKey: 'A',
                  title: 'Comparação A',
                  filters: stageCompareFiltersA,
                  setFilters: setStageCompareFiltersA,
                  options: stageCompareOptionsA,
                  rows: stageCompareTableRowsA,
                  summary: stageCompareSummaryA,
                }}
                panelB={{
                  panelKey: 'B',
                  title: 'Comparação B',
                  filters: stageCompareFiltersB,
                  setFilters: setStageCompareFiltersB,
                  options: stageCompareOptionsB,
                  rows: stageCompareTableRowsB,
                  summary: stageCompareSummaryB,
                }}
              />
            </div>
          )}
        </>
      )}

      {tab === 'escolas' && (
        <>
          <ModuleSectionIntro
            eyebrow="Visão por escola"
            title="Leitura escola a escola com foco em matrícula nova"
            description="Use esta aba para navegar nas escolas, abrir o detalhe individual e sustentar a apresentação com o recorte da etapa inicial e do turno."
            tone="green"
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
            <CompactHighlightCard title="Escolas na lista" value={fmtInt(schoolsTabSummary.totalSchools)} subtitle="Escolas exibidas com os filtros atuais" tone="blue" />
            <CompactHighlightCard title="Matrículas previstas" value={fmtInt(schoolsTabSummary.totalProjectedEntryStudents)} subtitle="Demanda prevista na etapa inicial" tone="green" />
            <CompactHighlightCard title="Saldo de vagas" value={fmtInt(schoolsTabSummary.totalVacancies)} subtitle="Vagas ainda disponíveis na etapa inicial" tone="violet" />
            <CompactHighlightCard title="Alertas de planejamento" value={fmtInt(schoolsTabSummary.alertSchools)} subtitle="Escolas com continuidade, limite ou revisão" tone="orange" />
          </div>

          <div className="card card-pad" style={{ marginBottom: 14, border: '1px solid #dbeafe', boxShadow: '0 10px 32px rgba(37, 99, 235, 0.05)' }}>
            <div className="card-header-row">
              <div>
                <div className="card-title">Filtros da lista</div>
                <div className="card-subtitle">Defina a escola, a zona e a execução que será apresentada.</div>
              </div>
              <DetailChip tone="blue">{activeRun ? `${activeRun.mode} em ${fmtDateTime(activeRun.createdAt)}` : 'Sem execução ativa'}</DetailChip>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(280px, 1.8fr) minmax(120px, 0.3fr) minmax(220px, 0.65fr)',
                gap: 10,
                alignItems: 'end',
                marginTop: 12,
              }}
            >
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Buscar escola</label>
                <Input value={schoolSearch} onChange={(e) => setSchoolSearch(e.target.value)} placeholder="Nome da escola ou INEP..." />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Zona</label>
                <Select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
                  <option value="">Todas</option>
                  {Object.entries(SCHOOL_ZONE).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
                </Select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Execução</label>
                <Select value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)}>
                  <option value="">Mais recente disponível</option>
                  {runOptions.map((run) => (
                    <option key={run.id} value={run.id}>{run.mode} · {run.baseYear}→{run.projectedYear} · {fmtDateTime(run.createdAt)}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>

          <ProjectionRunNotice run={schoolsProjection?.run} />
          {hasLegacyEntryGap(schoolsProjection?.data || []) && (
            <Alert type="warn">
              A execução selecionada não traz integralmente os novos campos de disponibilidade de matrículas. Se estes valores continuarem zerados, reexecute a projeção para recalcular com a regra atual.
            </Alert>
          )}

          <SchoolsProjectionTable
            rows={schoolsProjection?.data || []}
            loading={schoolsLoading}
            stages={settingsData?.stages || []}
            onRowClick={(row) => setDetailSchoolId(row.schoolId)}
          />
        </>
      )}

      {tab === 'configuracoes' && (
        <>
          <ModuleSectionIntro
            eyebrow="Governança da regra"
            title="Configurações que controlam a prospecção"
            description="Aqui ficam as regras pedagógicas e as exceções por escola que sustentam o cálculo apresentado no dashboard e na lista de escolas."
            tone="violet"
          />
          {settingsLoading ? <LoadingBlock /> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
                <CompactHighlightCard title="Política ativa" value="Turmas fixas" subtitle="Sem criação automática de turmas" tone="green" />
                <CompactHighlightCard title="Fluxo interno" value="Percurso real" subtitle="Continuidade avança pela oferta da escola" tone="blue" />
                <CompactHighlightCard title="Limite máximo" value="Só na entrada" subtitle="Aplicado apenas na etapa inicial" tone="orange" />
                <CompactHighlightCard title="Separação de turnos" value="Mantida" subtitle="Manhã e tarde permanecem independentes" tone="violet" />
              </div>
              <div className="card card-pad" style={{ marginBottom: 14, border: '1px solid #ddd6fe', boxShadow: '0 10px 32px rgba(124, 58, 237, 0.05)' }}>
                <div className="card-header-row">
                  <div>
                    <div className="card-title">Regras de progressão e capacidade</div>
                    <div className="card-subtitle">Conjunto ativo para {baseYear} → {projectedYear}</div>
                  </div>
                  <Button onClick={handleSaveRules} disabled={settingsBusy || !rulesDraft.length}>{settingsBusy ? 'Salvando...' : 'Salvar regras'}</Button>
                </div>
                <div className="form-grid" style={{ marginBottom: 14 }}>
                  <Field label="Nome do conjunto">
                    <Input value={rulesMeta.name} onChange={(e) => setRulesMeta((meta) => ({ ...meta, name: e.target.value }))} />
                  </Field>
                  <Field label="Observações">
                    <Input value={rulesMeta.notes} onChange={(e) => setRulesMeta((meta) => ({ ...meta, notes: e.target.value }))} />
                  </Field>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Etapa</th>
                        <th>Próxima etapa</th>
                        <th>Promoção %</th>
                        <th>Repetência %</th>
                        <th>Evasão %</th>
                        <th>Entrada %</th>
                        <th>Limite/turma</th>
                        <th>Fechamento pedagógico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rulesDraft.map((item) => (
                        <tr key={item.stageCode}>
                          <td><strong>{labelStage(item.stageCode, settingsData?.stages)}</strong></td>
                          <td>
                            <Select value={item.nextStageCode || ''} onChange={(e) => handleRuleChange(item.stageCode, 'nextStageCode', e.target.value || null)}>
                              <option value="">Saída da rede / sem progressão</option>
                              {(settingsData?.stages || []).map((stage) => <option key={stage.code} value={stage.code}>{stage.label}</option>)}
                            </Select>
                          </td>
                          <td><Input type="number" min="0" max="100" value={item.promotionRate ?? 0} onChange={(e) => handleRuleChange(item.stageCode, 'promotionRate', e.target.value)} /></td>
                          <td><Input type="number" min="0" max="100" value={item.repetitionRate ?? 0} onChange={(e) => handleRuleChange(item.stageCode, 'repetitionRate', e.target.value)} /></td>
                          <td><Input type="number" min="0" max="100" value={item.dropoutRate ?? 0} onChange={(e) => handleRuleChange(item.stageCode, 'dropoutRate', e.target.value)} /></td>
                          <td><Input type="number" min="0" max="300" value={item.entryRate ?? 100} onChange={(e) => handleRuleChange(item.stageCode, 'entryRate', e.target.value)} /></td>
                          <td><Input type="number" min="1" max="100" value={item.capacityLimit ?? ''} onChange={(e) => handleRuleChange(item.stageCode, 'capacityLimit', e.target.value)} /></td>
                          <td><RuleHealthBadge item={item} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card card-pad" style={{ border: '1px solid #dbeafe', boxShadow: '0 10px 32px rgba(37, 99, 235, 0.05)' }}>
                <div className="card-header-row">
                  <div>
                    <div className="card-title">Configurações por escola</div>
                    <div className="card-subtitle">Etapa de entrada e capacidades específicas para o ano projetado</div>
                  </div>
                  <Button variant="secondary" onClick={() => openSchoolSettingModal()}>+ Nova configuração</Button>
                </div>
                <DataTable
                  columns={[
                    { key: 'school', label: 'Escola', render: (row) => <strong>{row.school?.name}</strong> },
                    { key: 'entryStageCode', label: 'Etapa de entrada', render: (row) => labelStage(row.entryStageCode, settingsData?.stages) || 'Automática' },
                    { key: 'capacityOverrides', label: 'Capacidades customizadas', render: (row) => Object.keys(row.capacityOverrides || {}).length ? Object.entries(row.capacityOverrides).slice(0, 4).map(([stage, value]) => `${labelStage(stage, settingsData?.stages)}: ${value}`).join(' · ') : '—' },
                    { key: 'notes', label: 'Observações', render: (row) => row.notes || '—' },
                    { key: 'edit', label: '', align: 'right', render: (row) => <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openSchoolSettingModal(row); }}>✏️</Button> },
                  ]}
                  rows={settingsData?.schoolSettings || []}
                  loading={false}
                  emptyTitle="Nenhuma configuração específica"
                  emptyHint="As escolas usarão a etapa inicial detectada automaticamente e as capacidades padrão das regras."
                  emptyIcon="⚙️"
                />
              </div>
            </>
          )}
        </>
      )}

      {tab === 'simulador' && (
        <>
          <ModuleSectionIntro
            eyebrow="Cenários"
            title="Simulador de impacto"
            description="Monte cenários de apresentação sem alterar a base oficial. Ideal para testar variações de demanda e explicar efeitos nas matrículas novas."
            tone="orange"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 14, alignItems: 'start' }}>
            <div className="card card-pad" style={{ border: '1px solid #fed7aa', boxShadow: '0 10px 32px rgba(234, 88, 12, 0.05)' }}>
              <div className="card-title">Executar simulação</div>
              <div className="card-subtitle">Simule o impacto sobre as matrículas novas da etapa inicial sem sobrescrever a base oficial.</div>
              <div className="form-grid" style={{ marginTop: 14 }}>
                <Field label="Escola para ajuste opcional">
                  <Select value={simSchoolId} onChange={(e) => setSimSchoolId(e.target.value)}>
                    <option value="">Sem ajuste por escola</option>
                    {schoolOptions.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                  </Select>
                </Field>
                <Field label="Etapa do ajuste">
                  <Select value={simStageCode} onChange={(e) => setSimStageCode(e.target.value)}>
                    <option value="">Sem ajuste</option>
                    {(settingsData?.stages || []).map((stage) => <option key={stage.code} value={stage.code}>{stage.label}</option>)}
                  </Select>
                </Field>
                <Field label="Ajuste manual de alunos">
                  <Input type="number" value={simDelta} onChange={(e) => setSimDelta(e.target.value)} placeholder="Ex.: 12 ou -8" />
                </Field>
                <Field label="Observação do cenário">
                  <Textarea rows={4} value={simNotes} onChange={(e) => setSimNotes(e.target.value)} placeholder="Ex.: ampliar em 20 matrículas a demanda prevista do 1º ano para avaliar o impacto nas vagas novas" />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <Button onClick={executeSimulation} disabled={simBusy}>{simBusy ? 'Executando...' : 'Executar simulação'}</Button>
                <Button variant="secondary" onClick={() => setConfirmOfficialOpen(true)} disabled={simBusy}>Executar projeção oficial</Button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div className="card card-pad" style={{ border: '1px solid #dbeafe', boxShadow: '0 10px 32px rgba(37, 99, 235, 0.05)' }}>
                <div className="card-title">Último resultado</div>
                {lastRunResult ? (
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    <CompactHighlightCard title="Execução" value={lastRunResult.mode} subtitle={fmtDateTime(lastRunResult.createdAt)} tone="blue" />
                    <CompactHighlightCard title="Matrículas previstas" value={fmtInt(lastRunResult.totals?.entryProjectedStudents)} subtitle="Demanda consolidada da etapa inicial" tone="green" />
                    <CompactHighlightCard title="Saldo de vagas" value={fmtInt(lastRunResult.totals?.entryNewVacancies)} subtitle="Vagas restantes na etapa inicial" tone="violet" />
                    <CompactHighlightCard title="Déficit" value={fmtInt(lastRunResult.totals?.continuityStudentsUnserved)} subtitle="Alunos em alerta de continuidade" tone="orange" />
                    <CompactHighlightCard title="Demanda total" value={fmtInt(lastRunResult.totals?.projectedStudents)} subtitle={`ID ${lastRunResult.id}`} tone="violet" />
                  </div>
                ) : (
                  <Alert type="info">Ainda não há resultado recente nesta sessão. Execute uma simulação ou uma projeção oficial.</Alert>
                )}
              </div>
              <div className="card card-pad" style={{ border: '1px solid #fef3c7', background: 'linear-gradient(135deg, #fffdf5 0%, #ffffff 100%)' }}>
                <div className="card-title">Sugestão para apresentação</div>
                <div style={{ display: 'grid', gap: 8, marginTop: 10, fontSize: 13.5, color: 'var(--text-2)' }}>
                  <div>• Use o simulador para mostrar cenários de pressão na etapa inicial sem mexer na base oficial.</div>
                  <div>• Compare o total de matrículas novas com o déficit de continuidade para contextualizar decisões.</div>
                  <div>• Salve a execução oficial apenas quando o cenário validado estiver pronto para registro.</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'relatorios' && (
        <>
          <ModuleSectionIntro
            eyebrow="Saídas do módulo"
            title="Relatórios para apresentação e compartilhamento"
            description="Exporte a leitura por escola e por etapa em formatos prontos para análise externa e prestação de contas."
            tone="blue"
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <ExportActionCard title="Escolas (XLSX)" description="Lista consolidada das escolas com matrícula nova, etapa inicial e alertas." tone="green" onClick={() => enrollmentApi.exportSchools({ baseYear, projectedYear, runId: selectedRunId || undefined, format: 'xlsx' }).catch((err) => error(err.message))} />
            <ExportActionCard title="Escolas (CSV)" description="Versão leve para compartilhamento ou importação em outras ferramentas." tone="blue" onClick={() => enrollmentApi.exportSchools({ baseYear, projectedYear, runId: selectedRunId || undefined, format: 'csv' }).catch((err) => error(err.message))} />
            <ExportActionCard title="Etapas (XLSX)" description="Resumo consolidado da base e da projeção por etapa de ensino." tone="violet" onClick={() => enrollmentApi.exportStages({ baseYear, projectedYear, format: 'xlsx' }).catch((err) => error(err.message))} />
            <ExportActionCard title="Etapas (CSV)" description="Formato enxuto para análise externa e montagem de gráficos." tone="orange" onClick={() => enrollmentApi.exportStages({ baseYear, projectedYear, format: 'csv' }).catch((err) => error(err.message))} />
          </div>
          <Alert type="info">As exportações sempre usam os dados reais da base importada e da execução consultada.</Alert>
        </>
      )}

      {tab === 'importacao' && (
        <>
          <ModuleSectionIntro
            eyebrow="Base oficial"
            title="Importação e histórico da matrícula"
            description="Fluxo completo para carregar a base histórica, revisar a prévia, confirmar a importação e acompanhar os datasets utilizados nas projeções."
            tone="green"
          />
          <div className="card card-pad" style={{ marginBottom: 14, border: '1px solid #bbf7d0', boxShadow: '0 10px 32px rgba(34, 197, 94, 0.05)' }}>
            <div className="card-header-row">
              <div>
                <div className="card-title">Importar base oficial</div>
                <div className="card-subtitle">CSV/XLSX de matrículas por turma com prévia antes da gravação</div>
              </div>
              <Button onClick={handleSelectFile} disabled={importBusy}>{importBusy ? 'Analisando...' : 'Selecionar arquivo'}</Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                handlePreviewImport(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <div className="form-grid" style={{ marginTop: 14 }}>
              <Field label="Ano-base">
                <Input value={baseYear} readOnly />
              </Field>
              <Field label="Ano projetado">
                <Input value={projectedYear} readOnly />
              </Field>
              <Field label="Observações da carga">
                <Input value={importNotes} onChange={(e) => setImportNotes(e.target.value)} placeholder="Ex.: arquivo oficial consolidado em 09/2026" />
              </Field>
            </div>
            <Alert type="info">O parser trata as linhas de continuação do CSV oficial e preserva a base histórica em dataset próprio, sem sobrescrever diretamente 2026.</Alert>
          </div>

          {preview && (
            <div className="card card-pad" style={{ marginBottom: 14 }}>
              <div className="card-header-row">
                <div>
                  <div className="card-title">Prévia da importação</div>
                  <div className="card-subtitle">{preview.filename}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="secondary" onClick={() => setPreview(null)} disabled={importBusy}>Descartar</Button>
                  <Button onClick={handleConfirmImport} disabled={importBusy || preview.validRows === 0}>{importBusy ? 'Confirmando...' : `Confirmar ${preview.validRows} linha(s)`}</Button>
                </div>
              </div>
              <div className="import-summary">
                <div className="cell"><div className="num">{preview.totalRows}</div><div className="lbl">Linhas</div></div>
                <div className="cell" style={{ borderColor: 'var(--success)', borderWidth: 2 }}><div className="num" style={{ color: 'var(--success)' }}>{preview.newRows}</div><div className="lbl">Novas</div></div>
                <div className="cell" style={{ borderColor: 'var(--primary)', borderWidth: 2 }}><div className="num" style={{ color: 'var(--primary)' }}>{preview.updatedRows}</div><div className="lbl">Comparáveis</div></div>
                <div className="cell"><div className="num" style={{ color: 'var(--warning)' }}>{preview.duplicateRows}</div><div className="lbl">Duplicadas</div></div>
                <div className="cell" style={{ borderColor: 'var(--danger)', borderWidth: 2 }}><div className="num" style={{ color: 'var(--danger)' }}>{preview.errorRows}</div><div className="lbl">Erros</div></div>
              </div>
              <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Status</th>
                      <th>Dados</th>
                      <th>Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.rows || []).slice(0, 200).map((row) => {
                      const info = ROW_STATUS[row.status] || { label: row.status, cls: 'badge-gray' };
                      const dataStr = row.data
                        ? [`${row.data.schoolName} (${row.data.inep || '—'})`, row.data.classStageRaw, row.data.classLabel, row.data.shift, `${row.data.stageLabel}: ${row.data.studentsCount}`].filter(Boolean).join(' · ')
                        : '—';
                      return (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td>
                          <td><Badge cls={info.cls}>{info.label}</Badge></td>
                          <td style={{ fontSize: 12 }}>{dataStr}</td>
                          <td style={{ fontSize: 12, color: 'var(--danger)' }}>{(row.errors || []).map((item) => item.message).join(' · ') || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card card-pad">
            <div className="card-title">Bases históricas do ano-base</div>
            <DataTable
              columns={[
                { key: 'createdAt', label: 'Importada em', render: (row) => fmtDateTime(row.createdAt) },
                { key: 'sourceFileName', label: 'Arquivo', render: (row) => <span className="mono">{row.sourceFileName}</span> },
                { key: 'status', label: 'Status', render: (row) => <Badge cls={row.status === 'OFICIAL' ? 'badge-green' : row.status === 'ARQUIVADO' ? 'badge-gray' : 'badge-yellow'}>{row.status}</Badge> },
                { key: 'recordsCount', label: 'Linhas válidas', align: 'right', render: (row) => fmtInt(row.recordsCount) },
                { key: 'runsCount', label: 'Execuções', align: 'right', render: (row) => fmtInt(row.runsCount) },
                { key: 'approvedAt', label: 'Aprovada em', render: (row) => fmtDateTime(row.approvedAt) },
              ]}
              rows={overview?.datasets || []}
              loading={overviewLoading}
              emptyTitle="Nenhuma base confirmada"
              emptyHint="Faça a primeira importação oficial do ano-base para iniciar o módulo."
              emptyIcon="🗂️"
            />
          </div>
        </>
      )}

      <Modal
        open={schoolSettingOpen}
        onClose={() => setSchoolSettingOpen(false)}
        title="Configuração específica da escola"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSchoolSettingOpen(false)} disabled={schoolSettingBusy}>Cancelar</Button>
            <Button onClick={handleSaveSchoolSetting} disabled={schoolSettingBusy}>{schoolSettingBusy ? 'Salvando...' : 'Salvar configuração'}</Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Escola" required>
            <Select value={schoolSettingForm.schoolId} onChange={(e) => setSchoolSettingForm((form) => ({ ...form, schoolId: e.target.value }))}>
              <option value="">Selecione...</option>
              {schoolOptions.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </Select>
          </Field>
          <Field label="Etapa inicial ofertada">
            <Select value={schoolSettingForm.entryStageCode} onChange={(e) => setSchoolSettingForm((form) => ({ ...form, entryStageCode: e.target.value }))}>
              <option value="">Detectar automaticamente pela base</option>
              {(settingsData?.stages || []).map((stage) => <option key={stage.code} value={stage.code}>{stage.label}</option>)}
            </Select>
          </Field>
          <Field label="Observações">
            <Textarea rows={3} value={schoolSettingForm.notes} onChange={(e) => setSchoolSettingForm((form) => ({ ...form, notes: e.target.value }))} />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="card-subtitle" style={{ marginBottom: 8 }}>Sobrescrever capacidade por etapa</div>
          <div className="form-grid">
            {(settingsData?.stages || []).map((stage) => (
              <Field key={stage.code} label={stage.label}>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={schoolSettingForm.capacityOverrides?.[stage.code] ?? ''}
                  onChange={(e) => setSchoolSettingForm((form) => ({
                    ...form,
                    capacityOverrides: {
                      ...(form.capacityOverrides || {}),
                      [stage.code]: e.target.value === '' ? undefined : Number(e.target.value),
                    },
                  }))}
                />
              </Field>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(detailSchoolId)}
        onClose={() => setDetailSchoolId(null)}
        title={schoolDetail?.school?.name || 'Disponibilidade de matrículas da escola'}
        size="xl"
        footer={<Button onClick={() => setDetailSchoolId(null)}>Fechar</Button>}
      >
        {detailLoading || !detailSchoolId ? <LoadingBlock /> : schoolDetail && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <div className="card-subtitle" style={{ marginBottom: 0 }}>
                INEP <strong className="mono">{schoolDetail.school.inep || '—'}</strong> · {schoolDetail.run.baseYear} → {schoolDetail.run.projectedYear} · {schoolDetail.run.mode}
              </div>
              <PlanningStatusBadge
                row={{
                  entryStageCode: detailEntryStageCode,
                  entryNewVacancies: schoolDetail.planningSummary?.entryNewVacancies,
                  continuitySatisfied: schoolDetail.planningSummary?.continuitySatisfied,
                  continuityStudentsUnserved: schoolDetail.planningSummary?.continuityStudentsUnserved,
                }}
              />
            </div>

            {schoolDetail.planningSummary?.entryCapacityLimitMissing && (
              <Alert type="warn">
                Falta configurar o limite máximo da primeira etapa desta escola. Sem esse limite, o sistema não consegue apresentar a quantidade definitiva de matrículas novas.
              </Alert>
            )}

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                <EntryAvailabilityPanel
                  entryStageLabel={labelStage(detailEntryStageCode, settingsData?.stages) || 'Etapa inicial'}
                  planningSummary={schoolDetail.planningSummary}
                />
                <SchoolReadPanel
                  rows={schoolDetail.stageRows}
                  offeredShifts={schoolDetail.operationalProfile?.offeredShifts || []}
                  offeredStageCodes={schoolDetail.operationalProfile?.offeredStageCodes || []}
                  stages={settingsData?.stages || []}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <OverviewKpiCard icon="🎓" value={labelStage(detailEntryStageCode, settingsData?.stages) || 'Automática'} label="Primeira etapa ofertada" tone="green" />
                <OverviewKpiCard icon="👥" value={fmtInt(detailEntryRow?.reasonJson?.entryReferenceStudents || detailEntryRow?.currentStudents)} label="Referência atual da etapa" tone="blue" />
                <OverviewKpiCard icon="📚" value={fmtInt(sumContinuityDemand(schoolDetail.stageRows, detailEntryStageCode))} label="Alunos em continuidade" tone="yellow" />
                <OverviewKpiCard icon="🏷️" value={fmtInt(detailEntryRow?.reasonJson?.plannedCapacity)} label="Capacidade da etapa inicial" tone="violet" />
                <OverviewKpiCard icon="🆕" value={fmtInt(schoolDetail.planningSummary?.entryProjectedStudents)} label="Matrículas previstas" tone="green" />
                <OverviewKpiCard icon="📦" value={schoolDetail.planningSummary?.entryCapacityLimitMissing ? 'Pendente' : fmtInt(schoolDetail.planningSummary?.entryNewVacancies)} label="Saldo de vagas" tone="blue" />
                <OverviewKpiCard icon="🔁" value={`${fmtInt(schoolDetail.planningSummary?.totalPlannedClasses)} / ${fmtInt(schoolDetail.planningSummary?.totalAvailableClasses)}`} label="Turmas totais preservadas" tone="orange" />
              </div>

              <ShiftDistributionSection shiftBreakdown={schoolDetail.planningSummary?.shiftBreakdown || []} />

              <SchoolPathSection rows={schoolDetail.stageRows} entryStageCode={detailEntryStageCode} />
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOfficialOpen}
        onClose={() => setConfirmOfficialOpen(false)}
        onConfirm={executeOfficialRun}
        title="Executar projeção oficial"
        message={`Executar a projeção oficial para ${baseYear} → ${projectedYear} usando a base oficial e o conjunto ativo de regras?`}
        confirmLabel="Executar"
        busy={simBusy}
      />
    </>
  );
}

function ProjectionRunNotice({ run }) {
  if (!run) return null;
  const isSimulation = run.mode === 'SIMULACAO';
  return (
    <div
      style={{
        marginBottom: 12,
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${isSimulation ? '#fde68a' : '#bfdbfe'}`,
        background: isSimulation ? '#fff6cf' : '#eff6ff',
        color: isSimulation ? '#b45309' : '#1d4ed8',
        fontSize: 13,
      }}
    >
      Exibindo <strong>{isSimulation ? 'simulação' : 'projeção oficial'}</strong> executada em {fmtDateTime(run.createdAt)}.
    </div>
  );
}

function tonePalette(tone = 'blue') {
  return {
    green: { tint: '#f0fdf4', border: '#bbf7d0', accent: '#16a34a', iconBg: '#dcfce7', soft: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)' },
    blue: { tint: '#eff6ff', border: '#bfdbfe', accent: '#2563eb', iconBg: '#dbeafe', soft: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)' },
    yellow: { tint: '#fffbeb', border: '#fde68a', accent: '#d97706', iconBg: '#fef3c7', soft: 'linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)' },
    violet: { tint: '#f5f3ff', border: '#ddd6fe', accent: '#7c3aed', iconBg: '#ede9fe', soft: 'linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%)' },
    orange: { tint: '#fff7ed', border: '#fed7aa', accent: '#ea580c', iconBg: '#ffedd5', soft: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)' },
    slate: { tint: '#f8fafc', border: '#e2e8f0', accent: '#475569', iconBg: '#e2e8f0', soft: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)' },
  }[tone] || { tint: '#eff6ff', border: '#bfdbfe', accent: '#2563eb', iconBg: '#dbeafe', soft: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)' };
}

function shiftVisual(shift = '') {
  const normalized = String(shift).toUpperCase();
  if (normalized.includes('MANH')) return { icon: '☀️', tone: 'green', accent: '#22c55e', track: '#dcfce7' };
  if (normalized.includes('TARDE')) return { icon: '🌙', tone: 'yellow', accent: '#f59e0b', track: '#ffedd5' };
  if (normalized.includes('NOITE')) return { icon: '🌃', tone: 'violet', accent: '#8b5cf6', track: '#ede9fe' };
  return { icon: '⏱️', tone: 'blue', accent: '#2563eb', track: '#dbeafe' };
}

function DetailChip({ children, tone = 'blue' }) {
  const palette = tonePalette(tone);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        background: palette.tint,
        color: palette.accent,
        border: `1px solid ${palette.border}`,
      }}
    >
      {children}
    </span>
  );
}

function ModuleSectionIntro({ eyebrow, title, description, tone = 'blue' }) {
  const palette = tonePalette(tone);
  return (
    <div
      className="card card-pad"
      style={{
        marginBottom: 14,
        border: `1px solid ${palette.border}`,
        background: palette.soft,
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: palette.accent }}>{eyebrow}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', marginTop: 6 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 8, maxWidth: 820 }}>{description}</div>
    </div>
  );
}

function CompactHighlightCard({ title, value, subtitle, tone = 'blue' }) {
  const palette = tonePalette(tone);
  return (
    <div className="card" style={{ padding: '14px 16px', border: `1px solid ${palette.border}`, background: palette.soft, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)' }}>
      <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: palette.accent, fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-2)' }}>{subtitle}</div>
    </div>
  );
}

function SubtleMetricCard({ title, value, subtitle, tone = 'blue' }) {
  const palette = tonePalette(tone);
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: '#ffffff',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
      }}
    >
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', color: palette.accent, fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.25 }}>
        {subtitle}
      </div>
    </div>
  );
}

function PresentationHeroCard({ summary }) {
  return (
    <div className="card card-pad" style={{ border: '1px solid #bbf7d0', background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)', boxShadow: '0 12px 36px rgba(34, 197, 94, 0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#15803d' }}>Leitura principal para apresentação</div>
          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>{summary.headline}</div>
          <div style={{ marginTop: 10, fontSize: 13.5, color: 'var(--text-2)', maxWidth: 720 }}>{summary.description}</div>
        </div>
        <div style={{ minWidth: 120, padding: '14px 16px', borderRadius: 20, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(187,247,208,0.85)' }}>
          <div style={{ fontSize: 11.5, color: '#166534', fontWeight: 700 }}>Execução usada</div>
          <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: '#15803d' }}>{summary.runLabel}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-2)' }}>{summary.runMoment}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 18 }}>
        {summary.highlights.map((item) => (
          <CompactHighlightCard key={item.title} title={item.title} value={item.value} subtitle={item.subtitle} tone={item.tone} />
        ))}
      </div>
    </div>
  );
}

function PresentationTalkingPointsCard({ summary }) {
  return (
    <div className="card card-pad" style={{ border: '1px solid #dbeafe', boxShadow: '0 12px 36px rgba(37, 99, 235, 0.05)' }}>
      <div className="card-title" style={{ marginBottom: 0 }}>Pontos para fala</div>
      <div className="card-subtitle" style={{ marginTop: 4 }}>Sugestões objetivas para sustentar a apresentação.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {summary.talkingPoints.map((point, index) => (
          <div key={point} style={{ display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: '10px 0', borderBottom: index < summary.talkingPoints.length - 1 ? '1px dashed var(--border)' : 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 10, background: '#dbeafe', color: '#2563eb', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{index + 1}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{point}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportActionCard({ title, description, tone = 'blue', onClick }) {
  const palette = tonePalette(tone);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onClick}
      style={{
        padding: '18px 18px',
        border: `1px solid ${palette.border}`,
        borderRadius: 18,
        background: palette.soft,
        justifyContent: 'space-between',
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ display: 'grid', gap: 8, textAlign: 'left' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{description}</div>
      </div>
      <div style={{ color: palette.accent, fontSize: 18, fontWeight: 800 }}>⬇</div>
    </button>
  );
}

function EntryAvailabilityPanel({ entryStageLabel, planningSummary }) {
  const shiftBreakdown = planningSummary?.shiftBreakdown || [];
  const missing = planningSummary?.entryCapacityLimitMissing;
  return (
    <div
      className="card card-pad"
      style={{
        border: '1px solid #bbf7d0',
        background: 'linear-gradient(135deg, #f0fdf4 0%, #f7fee7 45%, #ffffff 100%)',
        boxShadow: '0 12px 32px rgba(34, 197, 94, 0.10)',
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#15803d' }}>Leitura da etapa inicial</div>
      <div style={{ fontSize: 12.5, color: '#166534', marginTop: 4 }}>Demanda prevista e saldo da primeira etapa ofertada</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 34, lineHeight: 1, fontWeight: 800, color: '#15803d' }}>{fmtInt(planningSummary?.entryProjectedStudents)}</div>
          <div style={{ marginTop: 8, fontSize: 13.5, color: '#166534', fontWeight: 700 }}>matrícula(s) prevista(s)</div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>em {entryStageLabel}</div>
        </div>
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 28,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(187,247,208,0.55))',
            display: 'grid',
            placeItems: 'center',
            color: '#16a34a',
            fontSize: 34,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
          }}
        >
          🌱
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        {shiftBreakdown.map((item) => {
          const visual = shiftVisual(item.shift);
          return (
            <DetailChip key={item.shift} tone={visual.tone}>
              <span>{visual.icon}</span>
              <span>{item.shift}: demanda {fmtInt(item.entryProjectedStudents)} · saldo {item.entryNewVacancies == null ? 'pend.' : fmtInt(item.entryNewVacancies)}</span>
            </DetailChip>
          );
        })}
        {!shiftBreakdown.length && <DetailChip tone="slate">Sem detalhamento por turno</DetailChip>}
      </div>
    </div>
  );
}

function SchoolReadPanel({ rows, offeredShifts, offeredStageCodes, stages }) {
  return (
    <div
      className="card card-pad"
      style={{
        border: '1px solid #dbeafe',
        background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 100%)',
        boxShadow: '0 12px 32px rgba(37, 99, 235, 0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Como esta escola foi lida</div>
        <DetailChip tone="blue">ℹ️ Informações do percurso</DetailChip>
      </div>
      <div style={{ display: 'grid', gap: 10, marginTop: 12, fontSize: 14 }}>
        <div><strong>Percurso real:</strong> {labelSchoolPath(rows)}</div>
        <div><strong>Regra:</strong> continuidade no percurso real, turmas totais fixas e limite máximo aplicado apenas na etapa inicial.</div>
        <div><strong>Turnos considerados:</strong> {offeredShifts.join(' · ') || '—'}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {offeredStageCodes.map((stageCode) => (
          <DetailChip key={stageCode} tone="blue">{labelStage(stageCode, stages)}</DetailChip>
        ))}
        {offeredShifts.map((shift) => (
          <DetailChip key={shift} tone="slate">{shift}</DetailChip>
        ))}
      </div>
    </div>
  );
}

function OverviewKpiCard({ icon, value, label, tone = 'blue' }) {
  const palette = tonePalette(tone);
  return (
    <div
      className="card"
      style={{
        padding: '14px 16px',
        border: `1px solid ${palette.border}`,
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr', gap: 12, alignItems: 'center' }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: palette.iconBg,
            color: palette.accent,
            display: 'grid',
            placeItems: 'center',
            fontSize: 20,
          }}
        >
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>{value}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-2)' }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function DonutProgress({ percent, color, track, size = 110 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `conic-gradient(${color} 0 ${percent}%, ${track} ${percent}% 100%)`,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: size - 26,
          height: size - 26,
          borderRadius: '50%',
          background: '#ffffff',
          display: 'grid',
          placeItems: 'center',
          fontSize: 18,
          fontWeight: 800,
          color: 'var(--text-1)',
          boxShadow: 'inset 0 0 0 1px rgba(148, 163, 184, 0.16)',
        }}
      >
        {fmtPct(percent, 0)}
      </div>
    </div>
  );
}

function ShiftVacancyCard({ item, total }) {
  const visual = shiftVisual(item.shift);
  const palette = tonePalette(visual.tone);
  const percent = total > 0 ? Math.round((safeNumber(item.entryProjectedStudents) / total) * 100) : 0;
  return (
    <div
      className="card"
      style={{
        padding: '18px 18px',
        border: `1px solid ${palette.border}`,
        background: palette.soft,
        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18 }}>{visual.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{item.shift}</div>
            <DetailChip tone={visual.tone}>{fmtPct(percent, 0)}</DetailChip>
          </div>
          <div style={{ marginTop: 14, fontSize: 28, lineHeight: 1.05, fontWeight: 800, color: palette.accent }}>{fmtInt(item.entryProjectedStudents)}</div>
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>matrícula(s) prevista(s)</div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--text-2)' }}>Saldo: <strong>{item.entryNewVacancies == null ? 'Pendente' : fmtInt(item.entryNewVacancies)}</strong></div>
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-1)' }}>Turmas fixas: <strong>{fmtInt(item.totalPlannedClasses)} / {fmtInt(item.totalAvailableClasses)}</strong></div>
        </div>
        <DonutProgress percent={percent} color={visual.accent} track={visual.track} />
      </div>
    </div>
  );
}

function ShiftDistributionSection({ shiftBreakdown }) {
  const total = shiftBreakdown.reduce((sum, item) => sum + safeNumber(item.entryProjectedStudents), 0);
  return (
    <div className="card card-pad" style={{ border: '1px solid #e5edf6', boxShadow: '0 10px 32px rgba(15, 23, 42, 0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="card-title" style={{ marginBottom: 0 }}>Demanda prevista por turno</div>
          <div className="card-subtitle" style={{ marginTop: 4 }}>Manhã e tarde permanecem separados no cálculo, com saldo de vagas exibido em cada turno.</div>
        </div>
        <DetailChip tone="green">Distribuição por turno</DetailChip>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
        {shiftBreakdown.map((item) => (
          <ShiftVacancyCard key={item.shift} item={item} total={total} />
        ))}
        <TotalDistributionCard items={shiftBreakdown} total={total} />
      </div>
    </div>
  );
}

function TotalDistributionCard({ items, total }) {
  return (
    <div className="card" style={{ padding: '18px', border: '1px solid #e5edf6', boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-2)', marginBottom: 14 }}>DISTRIBUIÇÃO TOTAL</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 18, alignItems: 'center' }}>
        <DonutSegments items={items} total={total} />
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item) => {
            const visual = shiftVisual(item.shift);
            const percent = total > 0 ? Math.round((safeNumber(item.entryProjectedStudents) / total) * 100) : 0;
            return (
              <div key={item.shift} style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--text-1)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: visual.accent, display: 'inline-block' }} />
                  {item.shift}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{fmtInt(item.entryProjectedStudents)} previstas ({fmtPct(percent, 0)}) · saldo {item.entryNewVacancies == null ? 'pendente' : fmtInt(item.entryNewVacancies)}</div>
              </div>
            );
          })}
          {!items.length && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Sem detalhamento por turno.</div>}
        </div>
      </div>
    </div>
  );
}

function DonutSegments({ items, total }) {
  const fallback = 'conic-gradient(#e2e8f0 0 100%)';
  let cursor = 0;
  const segments = items.map((item) => {
    const visual = shiftVisual(item.shift);
    const share = total > 0 ? (safeNumber(item.entryProjectedStudents) / total) * 100 : 0;
    const start = cursor;
    const end = cursor + share;
    cursor = end;
    return `${visual.accent} ${start}% ${end}%`;
  });
  return (
    <div
      style={{
        width: 118,
        height: 118,
        borderRadius: '50%',
        background: segments.length ? `conic-gradient(${segments.join(', ')})` : fallback,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: '50%',
          background: '#ffffff',
          boxShadow: 'inset 0 0 0 1px rgba(148, 163, 184, 0.16)',
        }}
      />
    </div>
  );
}

function SchoolPathSection({ rows, entryStageCode }) {
  return (
    <div className="card card-pad" style={{ border: '1px solid #dbeafe', boxShadow: '0 10px 32px rgba(37, 99, 235, 0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="card-title" style={{ marginBottom: 0 }}>Percurso da escola</div>
          <div className="card-subtitle" style={{ marginTop: 4 }}>A leitura abaixo acompanha apenas as etapas realmente ofertadas por esta escola.</div>
        </div>
        <DetailChip tone="blue">Fluxo da escola</DetailChip>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        {rows.map((row, index) => {
          const isEntryStage = row.stageCode === entryStageCode;
          return (
            <React.Fragment key={row.id || row.stageCode}>
              <div
                style={{
                  minWidth: 138,
                  padding: '14px 18px',
                  borderRadius: 999,
                  border: `1px solid ${isEntryStage ? '#86efac' : '#dbeafe'}`,
                  background: isEntryStage ? 'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)' : 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
                  boxShadow: '0 6px 20px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{row.stageLabel}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: isEntryStage ? '#166534' : 'var(--text-2)', fontWeight: isEntryStage ? 700 : 500 }}>
                  {isEntryStage ? 'Etapa ofertada' : 'Previsto no percurso'}
                </div>
              </div>
              {index < rows.length - 1 ? <div style={{ fontSize: 18, color: '#2563eb', fontWeight: 700 }}>→</div> : null}
            </React.Fragment>
          );
        })}
        {!rows.length && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Sem percurso registrado.</div>}
      </div>
    </div>
  );
}

function TeachingStageChartsSection({ chartGroups, baseYear, projectedYear }) {
  const cards = [
    { key: 'ED_INF', title: 'Educação Infantil' },
    { key: 'EF_INICIAIS', title: 'Ensino Fundamental Anos Iniciais' },
    { key: 'EF_FINAIS', title: 'Ensino Fundamental Anos Finais' },
    { key: 'EJA', title: 'EJA' },
  ];

  return (
    <div className="card card-pad">
      <div className="card-title">Comparativo de matrícula por etapa de ensino</div>
      <div className="card-subtitle">Base atual x projeção consolidada.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginTop: 8 }}>
        {cards.map((card) => (
          <SegmentComparisonCard
            key={card.key}
            title={card.title}
            rows={chartGroups[card.key] || []}
            baseYear={baseYear}
            projectedYear={projectedYear}
          />
        ))}
      </div>
    </div>
  );
}

function SegmentComparisonCard({ title, rows, baseYear, projectedYear }) {
  const maxValue = Math.max(1, ...rows.map((item) => Math.max(safeNumber(item.baseStudents), safeNumber(item.projectedStudents))));
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div className="card-title" style={{ marginBottom: 0 }}>{title}</div>
      <div className="card-subtitle" style={{ marginTop: 4 }}>{baseYear} x {projectedYear}</div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12.5, color: 'var(--text-2)' }}>
        <LegendDot color="#3b82f6" label="Base atual" />
        <LegendDot color="#22c55e" label="Projeção" />
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(rows.length, 1)}, minmax(56px, 1fr))`, gap: 10, alignItems: 'end' }}>
          {rows.map((item) => {
            const baseHeight = Math.max(10, Math.round((safeNumber(item.baseStudents) / maxValue) * 120));
            const projectedHeight = Math.max(10, Math.round((safeNumber(item.projectedStudents) / maxValue) * 120));
            return (
              <div key={item.stageCode} style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'end', minHeight: 150 }}>
                  <ChartBar height={baseHeight} color="#3b82f6" value={fmtInt(item.baseStudents)} width={18} />
                  <ChartBar height={projectedHeight} color="#22c55e" value={fmtInt(item.projectedStudents)} width={18} />
                </div>
                <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.2 }}>{item.stageLabel}</div>
              </div>
            );
          })}
          {!rows.length && <EmptyState icon="📊" title="Sem dados" hint="Nenhuma etapa encontrada neste grupo." />}
        </div>
      </div>
    </div>
  );
}

function DashboardMetricCard({ icon, title, value, description, tone = 'blue' }) {
  const palette = tonePalette(tone);
  return (
    <div className="stat-card" style={{ borderColor: palette.border, boxShadow: 'var(--shadow)' }}>
      <div className="stat-icon" style={{ background: palette.iconBg, color: palette.accent }}>
        {icon}
      </div>
      <div>
        <div className="stat-label">{title}</div>
        <div className="stat-value">{value}</div>
        <div className="stat-hint">{description}</div>
      </div>
    </div>
  );
}

function FilterMultiSelect({
  options = [],
  selectedValues = [],
  onChange,
  placeholder = 'Selecionar',
  searchable = false,
  searchPlaceholder = 'Pesquisar...',
  emptyLabel = 'Nenhuma opção encontrada',
}) {
  const containerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const normalizedSelectedValues = normalizeFilterArray(selectedValues);
  const selectedSet = new Set(normalizedSelectedValues);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const filteredOptions = useMemo(() => {
    const query = normalizeFilterText(search);
    if (!query) return options;
    return options.filter((option) => normalizeFilterText(option.searchText || `${option.label} ${option.meta || ''} ${option.value}`).includes(query));
  }, [options, search]);

  const selectedOptions = options.filter((option) => selectedSet.has(option.value));
  const summary = !normalizedSelectedValues.length
    ? placeholder
    : normalizedSelectedValues.length === 1
      ? (selectedOptions[0]?.meta ? `${selectedOptions[0].label} · ${selectedOptions[0].meta}` : (selectedOptions[0]?.label || '1 selecionado'))
      : `${normalizedSelectedValues.length} selecionados`;

  const handleToggle = (value) => {
    if (selectedSet.has(value)) {
      onChange(normalizedSelectedValues.filter((item) => item !== value));
      return;
    }
    onChange([...normalizedSelectedValues, value]);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="select"
        onClick={() => setOpen((value) => !value)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          textAlign: 'left',
          backgroundImage: 'none',
          paddingRight: 12,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: normalizedSelectedValues.length ? 'var(--text)' : 'var(--text-3)' }}>
          {summary}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!!normalizedSelectedValues.length && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--primary)' }}>
              {normalizedSelectedValues.length}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div className="dropdown" style={{ left: 0, right: 'auto', minWidth: '100%', width: 'max(100%, 300px)', zIndex: 120 }}>
          <div className="dropdown-header" style={{ display: 'grid', gap: 8 }}>
            {searchable && (
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>{normalizedSelectedValues.length} selecionado(s)</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(options.map((option) => option.value))}>Todos</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>Limpar</Button>
              </div>
            </div>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 8 }}>
            {filteredOptions.map((option) => {
              const checked = selectedSet.has(option.value);
              return (
                <label
                  key={option.value}
                  className="checkbox-row"
                  style={{
                    marginBottom: 6,
                    padding: '9px 10px',
                    border: `1px solid ${checked ? '#bfdbfe' : 'var(--border)'}`,
                    borderRadius: 10,
                    background: checked ? '#eff6ff' : 'var(--surface)',
                    alignItems: 'flex-start',
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => handleToggle(option.value)} />
                  <span style={{ display: 'grid', gap: 2, lineHeight: 1.25 }}>
                    <span>{option.label}</span>
                    {option.meta ? <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{option.meta}</span> : null}
                  </span>
                </label>
              );
            })}
            {!filteredOptions.length && <div style={{ padding: 12, fontSize: 12.5, color: 'var(--text-3)' }}>{emptyLabel}</div>}
          </div>
        </div>
      )}
    </div>
  );
}


function StageComparisonSection({ panelA, panelB }) {
  return (
    <div className="card card-pad">
      <div className="card-title">Comparativo entre etapas de ensino</div>
      <div className="card-subtitle">Cada painel abaixo possui filtros próprios para você comparar dois recortes diferentes da base atual.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14, marginTop: 10 }}>
        <StageComparisonPanel {...panelA} />
        <StageComparisonPanel {...panelB} />
      </div>
    </div>
  );
}

function StageComparisonPanel({ panelKey, title, filters, setFilters, options, rows, summary }) {
  return (
    <div className="card" style={{ padding: 16, border: '1px solid #dbeafe', boxShadow: '0 10px 28px rgba(37, 99, 235, 0.05)' }}>
      <div className="card-header-row" style={{ marginBottom: 8 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 0 }}>{title}</div>
          <div className="card-subtitle" style={{ marginTop: 4, marginBottom: 0 }}>
            Painel de comparação com filtros próprios.
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setFilters(createStageComparisonFilters())}>Limpar</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
        <Field label="ESCOLA / INEP" className="field-inline-tight">
          <>
            <Input
              list={`stage-compare-school-options-${panelKey}`}
              value={filters.schoolQuery || ''}
              onChange={(e) => setFilters((current) => ({ ...current, schoolQuery: e.target.value }))}
              placeholder="Digite escola ou INEP"
            />
            <datalist id={`stage-compare-school-options-${panelKey}`}>
              {options.schoolQuery.map((option) => <option key={option.value} value={option.label} />)}
            </datalist>
          </>
        </Field>
        <Field label="ZONA" className="field-inline-tight">
          <FilterMultiSelect
            options={options.zone}
            selectedValues={filters.zone}
            onChange={(values) => setFilters((current) => ({ ...current, zone: values }))}
            placeholder="Todas as zonas"
          />
        </Field>
        <Field label="ETAPA TURMA" className="field-inline-tight">
          <FilterMultiSelect
            options={options.classStageRaw}
            selectedValues={filters.classStageRaw}
            onChange={(values) => setFilters((current) => ({ ...current, classStageRaw: values }))}
            placeholder="Todas as etapas de turma"
          />
        </Field>
        <Field label="ETAPA MATRÍCULA" className="field-inline-tight">
          <FilterMultiSelect
            options={options.enrollmentStageRaw}
            selectedValues={filters.enrollmentStageRaw}
            onChange={(values) => setFilters((current) => ({ ...current, enrollmentStageRaw: values }))}
            placeholder="Todas as etapas de matrícula"
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
        <SubtleMetricCard title="Total de escolas" value={fmtInt(summary.totalSchools)} subtitle="Escolas no recorte" tone="blue" />
        <SubtleMetricCard title="Total de turmas" value={fmtInt(summary.totalClasses)} subtitle="Turmas distintas" tone="orange" />
        <SubtleMetricCard title="Total de alunos" value={fmtInt(summary.totalStudents)} subtitle="Soma de alunos" tone="green" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {buildDashboardActiveFilterChips(filters, options).map((item) => (
          <Badge key={`${title}-${item.label}-${item.value}`} cls="badge-blue">{item.label}: {item.value}</Badge>
        ))}
        {!hasDashboardFilters(filters) && <Badge cls="badge-gray">Sem filtros aplicados</Badge>}
      </div>

      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <div style={{ maxHeight: 460, overflowY: 'auto', border: '1px solid #dbe3f1', borderRadius: 12 }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>ESCOLA</th>
                <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>ZONA</th>
                <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>ETAPA TURMA</th>
                <th style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1 }}>ETAPA MATRÍCULA</th>
                <th className="num" style={{ ...schoolsHeaderCellStyle, position: 'sticky', top: 0, zIndex: 1, textAlign: 'right' }}>ALUNOS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={schoolsCellStyle}><strong>{row.schoolName}</strong></td>
                  <td style={schoolsCellStyle}>{row.zoneLabel || '—'}</td>
                  <td style={schoolsCellStyle}>{row.classStageRaw || '—'}</td>
                  <td style={schoolsCellStyle}>{row.enrollmentStageRaw || row.stageLabel || '—'}</td>
                  <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right' }}>{fmtInt(row.studentsCount)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} style={{ padding: 20 }}>
                    <EmptyState icon="📚" title="Sem dados para comparar" hint="Ajuste os filtros deste painel para montar o comparativo desejado." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StageComparisonCard({ groups, baseYear, projectedYear }) {
  const maxValue = Math.max(1, ...groups.map((item) => Math.max(safeNumber(item.baseStudents), safeNumber(item.projectedStudents))));
  return (
    <div className="card card-pad">
      <div className="card-header-row">
        <div>
          <div className="card-title">Comparativo de matrículas por etapa</div>
          <div className="card-subtitle">Base {baseYear} x Projeção {projectedYear}</div>
        </div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>Comparativo consolidado</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 10, fontSize: 12.5, color: 'var(--text-2)' }}>
        <LegendDot color="#3b82f6" label={`${baseYear} (base)`} />
        <LegendDot color="#22c55e" label={`${projectedYear} (projeção)`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(groups.length, 1)}, minmax(110px, 1fr))`, gap: 16, marginTop: 20, alignItems: 'end' }}>
        {groups.map((item) => {
          const baseHeight = Math.max(10, Math.round((safeNumber(item.baseStudents) / maxValue) * 170));
          const projectedHeight = Math.max(10, Math.round((safeNumber(item.projectedStudents) / maxValue) * 170));
          return (
            <div key={item.key} style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'end', minHeight: 220 }}>
                <ChartBar height={baseHeight} color="#3b82f6" value={fmtInt(item.baseStudents)} />
                <ChartBar height={projectedHeight} color="#22c55e" value={fmtInt(item.projectedStudents)} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>{item.label}</div>
            </div>
          );
        })}
        {!groups.length && <EmptyState icon="📊" title="Sem dados por etapa" hint="Execute uma projeção para comparar a base com a demanda projetada." />}
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span>{label}</span>
    </div>
  );
}

function ChartBar({ height, color, value, width = 38 }) {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: color }}>{value}</div>
      <div
        style={{
          width,
          height,
          borderRadius: 14,
          background: `linear-gradient(180deg, ${color} 0%, ${color}cc 100%)`,
          boxShadow: `0 12px 24px ${color}2a`,
        }}
      />
    </div>
  );
}

function AttentionIndicatorsCard({ items }) {
  return (
    <div className="card card-pad">
      <div className="card-title" style={{ marginBottom: 0 }}>Indicadores de atenção</div>
      <div className="card-subtitle" style={{ marginTop: 4 }}>Etapas e escolas que merecem maior acompanhamento.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {items.map((item) => (
          <div key={item.title} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '12px 10px', border: '1px solid #f1f5f9', borderRadius: 16, background: '#ffffff' }}>
            <div style={{ width: 40, height: 40, borderRadius: 14, background: item.iconBg, color: item.iconColor, display: 'grid', placeItems: 'center', fontSize: 18 }}>{item.icon}</div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-1)' }}>{item.title}</div>
              <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--text-2)' }}>{item.description}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: item.iconColor }}>{item.value}</div>
          </div>
        ))}
        {!items.length && <Alert type="info">Sem indicadores adicionais no momento.</Alert>}
      </div>
    </div>
  );
}

function StageProjectionSummaryCard({ groups, baseYear, projectedYear }) {
  return (
    <div className="card card-pad">
      <div className="card-header-row">
        <div>
          <div className="card-title">Projeção de matrículas por etapa</div>
          <div className="card-subtitle">Resumo consolidado para leitura rápida.</div>
        </div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>Resumo executivo</div>
      </div>

      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="data-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={schoolsHeaderCellStyle}>Etapa</th>
              <th className="num" style={{ ...schoolsHeaderCellStyle, textAlign: 'right' }}>Base {baseYear}</th>
              <th className="num" style={{ ...schoolsHeaderCellStyle, textAlign: 'right' }}>Demanda {projectedYear}</th>
              <th className="num" style={{ ...schoolsHeaderCellStyle, textAlign: 'right' }}>Variação</th>
              <th style={schoolsHeaderCellStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((item) => {
              const status = describeDashboardStageStatus(item);
              return (
                <tr key={item.key}>
                  <td style={schoolsCellStyle}><strong>{item.label}</strong></td>
                  <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right' }}>{fmtInt(item.baseStudents)}</td>
                  <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right' }}>{fmtInt(item.projectedStudents)}</td>
                  <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right', color: item.deltaStudents >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{formatSignedPct(item.deltaPct, 1)}</td>
                  <td style={schoolsCellStyle}><Badge cls={status.cls}>{status.label}</Badge></td>
                </tr>
              );
            })}
            {!groups.length && (
              <tr>
                <td colSpan={5} style={{ padding: 24 }}>
                  <EmptyState icon="📄" title="Nenhuma etapa consolidada" hint="Importe a base e execute a projeção para preencher este quadro." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopDemandSchoolsCard({ rows, stages, onSelectSchool }) {
  return (
    <div className="card card-pad">
      <div className="card-header-row">
        <div>
          <div className="card-title">Maiores demandas por escola</div>
          <div className="card-subtitle">Ranking por demanda prevista na etapa inicial.</div>
        </div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>Top 5 escolas</div>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="data-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={schoolsHeaderCellStyle}>#</th>
              <th style={schoolsHeaderCellStyle}>Escola</th>
              <th style={schoolsHeaderCellStyle}>Etapa inicial</th>
              <th className="num" style={{ ...schoolsHeaderCellStyle, textAlign: 'right' }}>Matrículas previstas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.schoolId} className={onSelectSchool ? 'clickable' : ''} onClick={onSelectSchool ? () => onSelectSchool(row.schoolId) : undefined}>
                <td style={schoolsCellStyle}>{index + 1}</td>
                <td style={schoolsCellStyle}>
                  <strong>{row.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.inep || 'INEP não informado'}</div>
                </td>
                <td style={schoolsCellStyle}>{labelStage(row.entryStageCode, stages) || 'Etapa inicial'}</td>
                <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{fmtInt(row.entryProjectedStudents)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} style={{ padding: 24 }}>
                  <Alert type="info">Execute a projeção para identificar as escolas com mais matrículas novas.</Alert>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentRunsCard({ runs, onSelectRun }) {
  return (
    <div className="card card-pad">
      <div className="card-header-row">
        <div>
          <div className="card-title">Execuções recentes</div>
          <div className="card-subtitle">Histórico das últimas execuções disponíveis.</div>
        </div>
        <div className="card-subtitle" style={{ marginBottom: 0 }}>Últimas 4 execuções</div>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table className="data-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={schoolsHeaderCellStyle}>Data</th>
              <th style={schoolsHeaderCellStyle}>Tipo</th>
              <th className="num" style={{ ...schoolsHeaderCellStyle, textAlign: 'right' }}>Etapas</th>
              <th style={schoolsHeaderCellStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 4).map((run) => (
              <tr key={run.id} className={onSelectRun ? 'clickable' : ''} onClick={onSelectRun ? () => onSelectRun(run.id) : undefined}>
                <td style={schoolsCellStyle}>{fmtDate(run.createdAt)}</td>
                <td style={schoolsCellStyle}>{run.mode === 'SIMULACAO' ? 'Simulação' : 'Oficial'}</td>
                <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right' }}>{fmtInt(run.resultsCount)}</td>
                <td style={schoolsCellStyle}><Badge cls={run.mode === 'SIMULACAO' ? 'badge-green' : 'badge-blue'}>{run.mode === 'SIMULACAO' ? 'Concluída' : 'Oficial'}</Badge></td>
              </tr>
            ))}
            {!runs?.length && (
              <tr>
                <td colSpan={4} style={{ padding: 24 }}>
                  <Alert type="info">Nenhuma execução registrada ainda.</Alert>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TerritoryDistributionCard({ summary }) {
  const total = safeNumber(summary.totalSchools);
  return (
    <div className="card card-pad">
      <div className="card-title">Distribuição territorial</div>
      <div className="card-subtitle">Leitura resumida da distribuição das escolas.</div>
      <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
        <ZoneStatCard title="Escolas urbanas" value={fmtInt(summary.urban)} percent={total > 0 ? (summary.urban / total) * 100 : 0} tone="blue" />
        <ZoneStatCard title="Escolas rurais" value={fmtInt(summary.rural)} percent={total > 0 ? (summary.rural / total) * 100 : 0} tone="green" />
        <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Total de escolas consideradas: <strong>{fmtInt(total)}</strong></div>
      </div>
    </div>
  );
}

function ZoneStatCard({ title, value, percent, tone }) {
  const palette = tonePalette(tone);
  return (
    <div className="card" style={{ padding: '12px 14px', borderColor: palette.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>{title}</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>{value}</div>
        </div>
        <Badge cls={tone === 'green' ? 'badge-green' : 'badge-blue'}>{fmtPct(percent, 1)}</Badge>
      </div>
    </div>
  );
}

function RecommendedActionsCard({ onOpenSettings, onOpenSchools, onOpenSimulator, onOpenReports }) {
  const actions = [
    { title: 'Revisar capacidade', description: 'Verificar infraestrutura e espaços disponíveis.', onClick: onOpenSettings },
    { title: 'Validar continuidade', description: 'Acompanhar alunos sem continuidade.', onClick: onOpenSchools },
    { title: 'Conferir simulações', description: 'Ajustar turmas e turnos conforme demanda.', onClick: onOpenSimulator },
    { title: 'Exportar relatório', description: 'Gerar PDF/Excel da projeção completa.', onClick: onOpenReports },
  ];
  return (
    <div className="card card-pad">
      <div className="card-title">Ações recomendadas</div>
      <div className="card-subtitle">Com base na projeção e nos indicadores de atenção.</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {actions.map((action) => (
          <div key={action.title} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>{action.title}</div>
              <div style={{ marginTop: 2, fontSize: 12.5, color: 'var(--text-2)' }}>{action.description}</div>
            </div>
            <Button variant="secondary" size="sm" onClick={action.onClick}>Abrir</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SchoolsProjectionTable({ rows, loading, stages = [], onRowClick }) {
  if (loading) {
    return (
      <div style={schoolsTableShellStyle}>
        <div style={{ padding: '28px 20px' }}>
          <LoadingBlock />
        </div>
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div style={schoolsTableShellStyle}>
        <EmptyState
          icon="🏫"
          title="Nenhuma projeção disponível"
          hint="Execute a projeção oficial ou uma simulação para preencher esta lista."
        />
      </div>
    );
  }

  return (
    <div style={schoolsTableShellStyle}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-2)', background: '#fbfcfe' }}>
        A lista abaixo mostra a leitura principal da etapa inicial de cada escola: <strong>demanda prevista de matrícula</strong> e <strong>saldo de vagas disponível</strong>, com memória resumida por turno.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th style={schoolsHeaderCellStyle}>INEP</th>
              <th style={schoolsHeaderCellStyle}>Escola</th>
              <th style={schoolsHeaderCellStyle}>Zona</th>
              <th style={schoolsHeaderCellStyle}>Primeira etapa</th>
              <th className="num" style={{ ...schoolsHeaderCellStyle, textAlign: 'right' }}>Referência atual</th>
              <th className="num" style={{ ...schoolsHeaderCellStyle, textAlign: 'right' }}>Matrículas previstas 2027</th>
              <th className="num" style={{ ...schoolsHeaderCellStyle, textAlign: 'right' }}>Saldo de vagas</th>
              <th style={schoolsHeaderCellStyle}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.schoolId} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                <td style={schoolsCellStyle}><span className="mono">{row.inep || '—'}</span></td>
                <td style={schoolsCellStyle}><strong>{row.name}</strong></td>
                <td style={schoolsCellStyle}><SchoolZonePill zone={row.zone} /></td>
                <td style={schoolsCellStyle}>{row.entryStageCode ? <strong>{labelStage(row.entryStageCode, stages)}</strong> : '—'}</td>
                <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right' }}>{row.entryStageCode ? fmtInt(row.entryReferenceStudents || row.entryCurrentStudents) : '—'}</td>
                <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right' }}>
                  {row.entryStageCode ? (
                    <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                      <strong style={{ color: 'var(--success)', fontSize: 16 }}>{fmtInt(row.entryProjectedStudents)}</strong>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{labelShiftDemandBreakdown(row.shiftBreakdown)}</div>
                    </div>
                  ) : '—'}
                </td>
                <td className="num" style={{ ...schoolsCellStyle, textAlign: 'right' }}>
                  {row.entryStageCode ? (row.entryNewVacancies == null ? 'Pendente' : fmtInt(row.entryNewVacancies)) : '—'}
                </td>
                <td style={schoolsCellStyle}><PlanningStatusBadge row={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SchoolZonePill({ zone }) {
  const info = SCHOOL_ZONE[zone];
  if (!info) return '—';
  return <Badge cls={info.cls}>{info.label}</Badge>;
}

function PlanningStatusBadge({ row }) {
  if (row.entryStageCode && row.entryNewVacancies == null) {
    return <Badge cls="badge-yellow">Configurar limite da etapa inicial</Badge>;
  }
  if (row.continuitySatisfied) {
    return <Badge cls="badge-green">Percurso atendido</Badge>;
  }
  if (row.continuityStudentsUnserved > 0) {
    return <Badge cls="badge-yellow">Alerta em continuidade</Badge>;
  }
  return <Badge cls="badge-gray">Revisar planejamento</Badge>;
}

function yearOptions() {
  return Array.from({ length: 8 }, (_, index) => currentYear + 2 - index);
}

function labelStage(stageCode, stages = []) {
  return stages?.find((stage) => stage.code === stageCode)?.label || stageCode || '';
}

function labelStageMode(mode) {
  return {
    ENTRADA: 'Entrada da escola',
    CONTINUIDADE: 'Continuidade',
    REORGANIZACAO: 'Reorganização interna',
    TERMINAL: 'Etapa terminal',
    EXPANSAO: 'Recebe progressão',
    TRANSICAO_FINAL: 'Transição final',
    INATIVA: 'Sem oferta/sem movimento',
  }[mode] || mode || '—';
}

function labelShiftDemandBreakdown(items = []) {
  if (!items?.length) return 'Sem detalhamento por turno';
  return items
    .map((item) => `${item.shift}: ${fmtInt(item.entryProjectedStudents || 0)}`)
    .join(' · ');
}

function labelTurnBreakdown(items = []) {
  if (!items?.length) return '—';
  return items
    .map((item) => `${item.shift} (${fmtInt(item.projectedStudents)})`)
    .join(' · ');
}

function labelSchoolPath(rows = []) {
  if (!rows?.length) return '—';
  return rows.map((row) => row.stageLabel).join(' → ');
}

function formatSignedPct(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const numeric = Number(value);
  return `${numeric >= 0 ? '+' : ''}${fmtPct(numeric, digits)}`;
}

function describeDashboardStageStatus(item) {
  if (safeNumber(item.projectedStudents) === 0 && safeNumber(item.baseStudents) > 0) {
    return { label: 'Atenção', cls: 'badge-yellow' };
  }
  if (item.deltaStudents > 0) {
    return { label: 'Crescimento', cls: 'badge-green' };
  }
  if (item.deltaStudents < 0) {
    return { label: 'Atenção', cls: 'badge-yellow' };
  }
  return { label: 'Estável', cls: 'badge-blue' };
}

function dashboardStageBucket(item = {}) {
  const text = `${item.stageCode || ''} ${item.stageLabel || ''} ${item.segment || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (text.includes('EJA')) return 'EJA';
  if (text.includes('ENSINO_MEDIO') || text.includes('ENSINO MEDIO') || /^EM\d/.test(String(item.stageCode || '').toUpperCase())) return 'MEDIO';
  if (text.includes('CRECHE') || text.includes('BERCARIO') || text.includes('MATERNAL') || text.includes('PRE-ESCOLA') || text.includes('PRE ESCOLA') || text.includes('PERIODO') || text.includes('EDUCACAO_INFANTIL') || text.includes('EDUCACAO INFANTIL')) return 'ED_INF';
  if (/\b([6-9])(O|º|°)?\s*ANO\b/.test(text) || /EF[6-9]/.test(text)) return 'EF_FINAIS';
  if (/\b([1-5])(O|º|°)?\s*ANO\b/.test(text) || /EF[1-5]/.test(text)) return 'EF_INICIAIS';
  if (text.includes('ENSINO_FUNDAMENTAL') || text.includes('ENSINO FUNDAMENTAL')) return 'EF_INICIAIS';
  return 'OUTROS';
}

function buildDashboardStageGroups(rows = []) {
  const config = {
    ED_INF: { key: 'ED_INF', label: 'Educação Infantil' },
    EF_INICIAIS: { key: 'EF_INICIAIS', label: 'Ensino Fundamental 1º ao 5º ano' },
    EF_FINAIS: { key: 'EF_FINAIS', label: 'Ensino Fundamental 6º ao 9º ano' },
    MEDIO: { key: 'MEDIO', label: 'Ensino Médio' },
    EJA: { key: 'EJA', label: 'EJA' },
    OUTROS: { key: 'OUTROS', label: 'Outras etapas' },
  };
  const order = ['ED_INF', 'EF_INICIAIS', 'EF_FINAIS', 'MEDIO', 'EJA', 'OUTROS'];
  const map = new Map(order.map((key) => [key, { ...config[key], baseStudents: 0, projectedStudents: 0, deltaStudents: 0, deltaPct: 0 }]));

  rows.forEach((row) => {
    const key = dashboardStageBucket(row);
    const target = map.get(key) || map.get('OUTROS');
    target.baseStudents += safeNumber(row.currentStudents);
    target.projectedStudents += safeNumber(row.projectedStudents);
  });

  return order
    .map((key) => map.get(key))
    .filter((item) => safeNumber(item.baseStudents) > 0 || safeNumber(item.projectedStudents) > 0)
    .map((item) => {
      const deltaStudents = safeNumber(item.projectedStudents) - safeNumber(item.baseStudents);
      const deltaPct = safeNumber(item.baseStudents) > 0 ? ((deltaStudents / safeNumber(item.baseStudents)) * 100) : 0;
      return { ...item, deltaStudents, deltaPct };
    });
}

function buildDashboardAttentionItems({ stageGroups = [], schoolRows = [], topSchools = [] }) {
  const positiveStages = stageGroups.filter((item) => item.deltaStudents > 0).length;
  const negativeStages = stageGroups.filter((item) => item.deltaStudents < 0).length;
  const pendingCapacity = schoolRows.filter((row) => row.entryStageCode && row.entryNewVacancies == null).length;
  const continuityAlerts = schoolRows.filter((row) => safeNumber(row.continuityStudentsUnserved) > 0).length;
  const topSchool = topSchools[0] || null;
  return [
    {
      icon: '⬆️',
      iconBg: '#fee2e2',
      iconColor: '#ef4444',
      title: 'Etapas com aumento de demanda',
      description: 'Etapas que cresceram entre a base e a projeção.',
      value: fmtInt(positiveStages),
    },
    {
      icon: '⬇️',
      iconBg: '#ffedd5',
      iconColor: '#f97316',
      title: 'Etapas com queda de demanda',
      description: 'Etapas com redução na projeção consolidada.',
      value: fmtInt(negativeStages),
    },
    {
      icon: '🏫',
      iconBg: '#dbeafe',
      iconColor: '#2563eb',
      title: 'Escola com maior oferta inicial',
      description: topSchool ? topSchool.name : 'Sem ranking disponível.',
      value: topSchool ? fmtInt(topSchool.entryProjectedStudents) : '—',
    },
    {
      icon: '🟣',
      iconBg: '#ede9fe',
      iconColor: '#8b5cf6',
      title: 'Pendências de configuração',
      description: 'Limite inicial pendente ou alerta real de continuidade.',
      value: fmtInt(pendingCapacity + continuityAlerts),
    },
  ];
}

function summarizeTerritoryDistribution(rows = []) {
  const summary = { urban: 0, rural: 0, totalSchools: 0 };
  const seen = new Set();
  rows.forEach((row) => {
    const id = row.schoolId || row.id || row.inep || row.name;
    if (!id || seen.has(id)) return;
    seen.add(id);
    summary.totalSchools += 1;
    const zone = String(row.zone || '').toUpperCase();
    if (zone === 'SEDE' || zone === 'URBANA') summary.urban += 1;
    else summary.rural += 1;
  });
  return summary;
}

function buildPresentationSummary({ overview, stageGroups = [], schoolRows = [], topSchools = [], territory, activeRun }) {
  const totalVacancies = safeNumber(overview?.metrics?.entryNewVacancies);
  const totalEntryDemand = safeNumber(overview?.metrics?.entryProjectedStudents);
  const deficit = safeNumber(overview?.metrics?.continuityStudentsUnserved);
  const topStage = [...stageGroups].sort((a, b) => safeNumber(b.deltaStudents) - safeNumber(a.deltaStudents))[0] || null;
  const topSchool = topSchools[0] || null;
  const alertSchools = schoolRows.filter((row) => safeNumber(row.continuityStudentsUnserved) > 0 || (row.entryStageCode && row.entryNewVacancies == null)).length;
  const runLabel = activeRun ? (activeRun.mode === 'SIMULACAO' ? 'Simulação ativa' : 'Execução oficial') : 'Sem execução';
  const runMoment = activeRun?.createdAt ? fmtDateTime(activeRun.createdAt) : 'Execute uma projeção para gerar leitura consolidada';
  return {
    headline: `${fmtInt(totalEntryDemand)} matrículas previstas na etapa inicial para ${overview?.projectedYear || ''}`.trim(),
    description: topStage
      ? `A maior pressão de crescimento aparece em ${topStage.label}. A leitura consolidada mantém o foco na etapa inicial das escolas e preserva as turmas totais já existentes.`
      : 'A leitura consolidada mantém o foco na etapa inicial das escolas e preserva as turmas totais já existentes.',
    runLabel,
    runMoment,
    highlights: [
      { title: 'Escolas com alerta', value: fmtInt(alertSchools), subtitle: 'Planejamento ou continuidade merecem revisão', tone: 'orange' },
      { title: 'Maior crescimento', value: topStage ? topStage.label : '—', subtitle: topStage ? formatSignedPct(topStage.deltaPct, 1) : 'Sem variação consolidada', tone: 'blue' },
      { title: 'Escola com maior demanda inicial', value: topSchool ? topSchool.name : '—', subtitle: topSchool ? `${fmtInt(topSchool.entryProjectedStudents)} matrículas previstas` : 'Sem ranking disponível', tone: 'green' },
      { title: 'Distribuição territorial', value: territory ? `${fmtInt(territory.urban)} urbana(s)` : '—', subtitle: territory ? `${fmtInt(territory.rural)} rural(is)` : 'Sem leitura territorial', tone: 'violet' },
    ],
    talkingPoints: [
      `${fmtInt(totalEntryDemand)} matrículas estão previstas para a etapa inicial das escolas, respeitando a oferta real de cada unidade.`,
      deficit > 0
        ? `${fmtInt(deficit)} alunos permanecem em alerta de continuidade, o que indica necessidade de monitoramento de percurso e configuração.`
        : 'No cenário atual, não há alerta consolidado de continuidade pendente no total projetado.',
      topStage
        ? `${topStage.label} concentra a maior variação na comparação entre a base e a projeção, sendo um bom destaque para a apresentação.`
        : 'As variações por etapa estão equilibradas no comparativo entre base e projeção.',
      topSchool
        ? `${topSchool.name} aparece entre as escolas com maior demanda prevista de entrada, útil para exemplificar a leitura escola a escola.`
        : 'O ranking por escola pode ser usado para exemplificar onde a demanda inicial será mais pressionada.',
    ],
  };
}

function summarizeSchoolPlanningRows(rows = []) {
  return {
    totalSchools: rows.length,
    totalProjectedEntryStudents: rows.reduce((sum, row) => sum + safeNumber(row.entryProjectedStudents), 0),
    totalVacancies: rows.reduce((sum, row) => sum + safeNumber(row.entryNewVacancies), 0),
    alertSchools: rows.filter((row) => safeNumber(row.continuityStudentsUnserved) > 0 || row.entryNewVacancies == null).length,
    pendingCapacity: rows.filter((row) => row.entryStageCode && row.entryNewVacancies == null).length,
  };
}

function buildDashboardRecordRows(records = [], schoolMap = new Map(), stages = []) {
  return records.map((record) => {
    const school = schoolMap.get(record.schoolId) || {};
    return {
      ...record,
      inep: school.inep || '',
      schoolName: school.name || 'Escola',
      zone: school.zone || '',
      stageLabel: labelStage(record.stageCode, stages),
    };
  });
}

function normalizeFilterArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function applyDashboardFilters(rows = [], filters = {}) {
  const schoolQuery = normalizeFilterText(filters.schoolQuery);
  const zones = normalizeFilterArray(filters.zone);
  const shifts = normalizeFilterArray(filters.shift);
  const classStages = normalizeFilterArray(filters.classStageRaw);
  const classLabels = normalizeFilterArray(filters.classLabel);
  const enrollmentStages = normalizeFilterArray(filters.enrollmentStageRaw);

  return rows.filter((row) => (
    (!schoolQuery || normalizeFilterText(row.schoolName).includes(schoolQuery) || normalizeFilterText(row.inep).includes(schoolQuery))
    && (!zones.length || zones.includes(row.zone))
    && (!classStages.length || classStages.includes(row.classStageRaw))
    && (!classLabels.length || classLabels.includes(row.classLabel))
    && (!shifts.length || shifts.includes(row.shift))
    && (!enrollmentStages.length || enrollmentStages.includes(row.enrollmentStageRaw))
  ));
}

function buildFilterOptionsFromRows(rows = [], key, labelKey = key) {
  return [...new Map(rows
    .filter((row) => row[key])
    .map((row) => [row[key], { value: row[key], label: row[labelKey] || row[key] }]))
    .values()]
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR'));
}

function normalizeFilterText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function buildDashboardFilterOptions(rows = [], filters = {}) {
  const excluding = (key) => applyDashboardFilters(rows, { ...filters, [key]: key === 'schoolQuery' ? '' : [] });
  const zoneRows = excluding('zone');
  const zone = [...new Map(zoneRows
    .filter((row) => row.zone)
    .map((row) => [row.zone, {
      value: row.zone,
      label: SCHOOL_ZONE[row.zone]?.label || row.zone,
      searchText: SCHOOL_ZONE[row.zone]?.label || row.zone,
    }]))
    .values()]
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR'));

  return {
    schoolQuery: [...new Map(excluding('schoolQuery')
      .filter((row) => row.schoolName || row.inep)
      .map((row) => [row.schoolId || `${row.schoolName}-${row.inep}`, {
        value: row.schoolId || `${row.schoolName}-${row.inep}`,
        label: row.inep ? `${row.schoolName} · ${row.inep}` : row.schoolName,
      }]))
      .values()]
      .sort((a, b) => String(a.label).localeCompare(String(b.label), 'pt-BR')),
    zone,
    shift: buildFilterOptionsFromRows(excluding('shift'), 'shift'),
    classStageRaw: buildFilterOptionsFromRows(excluding('classStageRaw'), 'classStageRaw'),
    classLabel: buildFilterOptionsFromRows(excluding('classLabel'), 'classLabel'),
    enrollmentStageRaw: buildFilterOptionsFromRows(excluding('enrollmentStageRaw'), 'enrollmentStageRaw'),
  };
}


function buildStageComparisonTableRows(rows = []) {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = [row.schoolId, row.zone, row.classStageRaw, row.enrollmentStageRaw || row.stageCode].map((item) => String(item || '')).join('|');
    const current = grouped.get(key) || {
      id: key,
      schoolId: row.schoolId,
      schoolName: row.schoolName || 'Escola',
      zone: row.zone || '',
      zoneLabel: SCHOOL_ZONE[row.zone]?.label || row.zone || '',
      classStageRaw: row.classStageRaw || '',
      enrollmentStageRaw: row.enrollmentStageRaw || row.stageLabel || '',
      stageLabel: row.stageLabel || '',
      studentsCount: 0,
    };
    current.studentsCount += safeNumber(row.studentsCount);
    grouped.set(key, current);
  });
  return [...grouped.values()].sort((a, b) => (
    String(a.schoolName).localeCompare(String(b.schoolName), 'pt-BR')
    || String(a.classStageRaw).localeCompare(String(b.classStageRaw), 'pt-BR')
    || String(a.enrollmentStageRaw).localeCompare(String(b.enrollmentStageRaw), 'pt-BR')
  ));
}

function summarizeFilteredDashboardRows(rows = []) {
  return {
    totalSchools: new Set(rows.map((row) => row.schoolId).filter(Boolean)).size,
    totalStudents: rows.reduce((sum, row) => sum + safeNumber(row.studentsCount), 0),
    totalClasses: new Set(rows.map((row) => [row.schoolId, row.contextKey || row.classStageRaw, row.classLabel, row.shift].filter(Boolean).join('|')).filter(Boolean)).size,
    totalEnrollmentStages: new Set(rows.map((row) => row.enrollmentStageRaw || row.stageCode).filter(Boolean)).size,
  };
}

function hasDashboardFilters(filters = {}) {
  return Object.values(filters).some((value) => (Array.isArray(value) ? value.filter(Boolean).length > 0 : Boolean(String(value || '').trim())));
}

function buildDashboardActiveFilterChips(filters = {}, options = {}) {
  const resolver = {
    schoolQuery: 'ESCOLA / INEP',
    zone: 'ZONA',
    shift: 'TURNO',
    classStageRaw: 'ETAPA TURMA',
    classLabel: 'TURMA',
    enrollmentStageRaw: 'ETAPA MATRÍCULA',
  };
  return Object.entries(resolver)
    .flatMap(([key, label]) => {
      if (key === 'schoolQuery') {
        return filters.schoolQuery ? [{ label, value: filters.schoolQuery }] : [];
      }
      return normalizeFilterArray(filters[key]).map((value) => {
        const option = options[key]?.find((item) => item.value === value);
        return {
          label,
          value: option?.meta ? `${option.label} (${option.meta})` : option?.label || value,
        };
      });
    });
}

function buildDashboardChartGroups(stageSummary = []) {
  const groups = { ED_INF: [], EF_INICIAIS: [], EF_FINAIS: [], EJA: [] };
  stageSummary.forEach((row) => {
    const bucket = dashboardStageBucket(row);
    if (groups[bucket]) {
      groups[bucket].push({
        stageCode: row.stageCode,
        stageLabel: row.stageLabel,
        baseStudents: safeNumber(row.currentStudents),
        projectedStudents: safeNumber(row.projectedStudents),
      });
    }
  });
  return groups;
}

function ruleHealth(item) {
  const promotion = safeNumber(item?.promotionRate);
  const repetition = safeNumber(item?.repetitionRate);
  const dropout = safeNumber(item?.dropoutRate);
  const total = promotion + repetition + dropout;
  const hasNextStage = Boolean(item?.nextStageCode);
  const unresolved = hasNextStage && total < 100 ? 100 - total : 0;
  const exits = !hasNextStage && total < 100 ? 100 - total : 0;
  return { total, unresolved, exits, hasNextStage };
}

function RuleHealthBadge({ item }) {
  const info = ruleHealth(item);
  if (info.total > 100) {
    return <Badge cls="badge-red">{fmtPct(info.total, 0)} · excede 100%</Badge>;
  }
  if (info.unresolved > 0) {
    return <Badge cls="badge-yellow">{fmtPct(info.total, 0)} · saldo {fmtPct(info.unresolved, 0)} irá para progressão</Badge>;
  }
  if (info.exits > 0) {
    return <Badge cls="badge-blue">{fmtPct(info.total, 0)} · saída/conclusão {fmtPct(info.exits, 0)}</Badge>;
  }
  return <Badge cls="badge-green">Regra fechada em {fmtPct(info.total, 0)}</Badge>;
}

function fmtDecimal(value) {
  if (value == null || value === '') return '—';
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function hasLegacyEntryGap(rows = []) {
  return rows.length > 0 && rows.every((row) => !row.entryStageCode && safeNumber(row.entryNewVacancies) === 0);
}

function getEntryStageRow(rows = [], planningSummary = null) {
  const entryStageCode = planningSummary?.entryStageCode;
  return rows.find((row) => row.stageCode === entryStageCode) || rows.find((row) => safeNumber(row.reasonJson?.entryDemand) > 0) || null;
}

function sumContinuityDemand(rows = [], entryStageCode = null) {
  return rows
    .filter((row) => row.stageCode !== entryStageCode)
    .reduce((sum, row) => sum + safeNumber(row.reasonJson?.continuityDemand), 0);
}

function sumRows(rows = [], key) {
  return rows.reduce((sum, row) => sum + safeNumber(row[key]), 0);
}
