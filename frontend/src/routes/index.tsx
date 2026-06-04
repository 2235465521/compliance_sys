import { createBrowserRouter, Navigate } from 'react-router-dom'
import BasicLayout from '@/layouts/BasicLayout'
import AlertPage from '@/pages/alert'
import ComplianceTaskHub from '@/pages/compliance'
import ComplianceWizardPage from '@/pages/compliance/ComplianceWizardPage'
import EnterpriseStandardDocumentPage from '@/pages/compliance/EnterpriseStandardDocumentPage'
import DashboardPage from '@/pages/dashboard'
import EnterpriseArchiveLayout from '@/pages/enterprise-archive/Layout'
import EnterpriseCreatePage from '@/pages/enterprise-archive/create'
import EnterpriseDetailPage from '@/pages/enterprise-archive/detail/EnterpriseDetailPage'
import EnterpriseListPage from '@/pages/enterprise-archive/list'
import DuplicateCheckPage from '@/pages/duplicate-check'
import NoveltySearchLayout from '@/pages/novelty-search/Layout'
import NoveltySearchPage from '@/pages/novelty-search'
import StandardLibraryBodyIngestPage from '@/pages/standard-library/body'
import StandardLibraryIndexRedirect from '@/pages/standard-library'
import StandardLibraryIndexIngestPage from '@/pages/standard-library/index-ingest'
import StandardLibraryLayout from '@/pages/standard-library/Layout'
import StandardLibraryLineagePage from '@/pages/standard-library/lineage'
import StandardLibraryRegistryPage from '@/pages/standard-library/standards'
import StandardLibraryTaxonomyPage from '@/pages/standard-library/taxonomy'
import SystemAuditLogPage from '@/pages/system/audit-log'
import SystemLayout from '@/pages/system/Layout'
import SystemRolesPage from '@/pages/system/roles'
import SystemUsersPage from '@/pages/system/users'
import TemplateArchivePage from '@/pages/template-archive'
import BatchNormativeRefLayout from '@/pages/batch-normative-ref/Layout'
import BatchJobListPage from '@/pages/batch-normative-ref/BatchJobListPage'
import BatchJobDetailPage from '@/pages/batch-normative-ref/BatchJobDetailPage'
import BatchItemReferencePage from '@/pages/batch-normative-ref/BatchItemReferencePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BasicLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      {
        path: 'standard-library',
        element: <StandardLibraryLayout />,
        children: [
          { index: true, element: <StandardLibraryIndexRedirect /> },
          { path: 'registry', element: <StandardLibraryRegistryPage /> },
          { path: 'lineage', element: <StandardLibraryLineagePage /> },
          { path: 'body', element: <StandardLibraryBodyIngestPage /> },
          { path: 'index-ingest', element: <StandardLibraryIndexIngestPage /> },
          { path: 'taxonomy', element: <StandardLibraryTaxonomyPage /> },
        ],
      },
      {
        path: 'novelty-search',
        element: <NoveltySearchLayout />,
        children: [{ index: true, element: <NoveltySearchPage /> }],
      },
      { path: 'duplicate-check', element: <DuplicateCheckPage /> },
      { path: 'compliance', element: <ComplianceTaskHub /> },
      { path: 'compliance/evaluations/:taskId', element: <ComplianceWizardPage /> },
      { path: 'compliance/evaluations/:taskId/document', element: <EnterpriseStandardDocumentPage /> },
      {
        path: 'batch-normative-reference',
        element: <BatchNormativeRefLayout />,
        children: [
          { index: true, element: <BatchJobListPage /> },
          { path: ':jobId/items/:itemId', element: <BatchItemReferencePage /> },
          { path: ':jobId', element: <BatchJobDetailPage /> },
        ],
      },
      { path: 'alert', element: <AlertPage /> },
      {
        path: 'enterprise-archive',
        element: <EnterpriseArchiveLayout />,
        children: [
          { index: true, element: <EnterpriseListPage /> },
          { path: 'create', element: <EnterpriseCreatePage /> },
          { path: ':enterpriseId', element: <EnterpriseDetailPage /> },
        ],
      },
      { path: 'template-archive', element: <TemplateArchivePage /> },
      {
        path: 'system',
        element: <SystemLayout />,
        children: [
          { index: true, element: <Navigate to="/system/users" replace /> },
          { path: 'users', element: <SystemUsersPage /> },
          { path: 'roles', element: <SystemRolesPage /> },
          { path: 'audit-log', element: <SystemAuditLogPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])
