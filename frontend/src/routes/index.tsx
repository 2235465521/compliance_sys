import { createBrowserRouter, Navigate } from 'react-router-dom'
import BasicLayout from '@/layouts/BasicLayout'
import AlertPage from '@/pages/alert'
import CompliancePage from '@/pages/compliance'
import DashboardPage from '@/pages/dashboard'
import EnterpriseArchiveLayout from '@/pages/enterprise-archive/Layout'
import EnterpriseCreatePage from '@/pages/enterprise-archive/create'
import EnterpriseDetailPage from '@/pages/enterprise-archive/detail/EnterpriseDetailPage'
import EnterpriseListPage from '@/pages/enterprise-archive/list'
import DuplicateCheckPage from '@/pages/duplicate-check'
import NoveltyCreateTaskPage from '@/pages/novelty-search/create'
import NoveltyTaskListPage from '@/pages/novelty-search/list'
import NoveltySearchLayout from '@/pages/novelty-search/Layout'
import TaskDetailPage from '@/pages/novelty-search/tasks/TaskDetailPage'
import StandardLibraryBodyIngestPage from '@/pages/standard-library/body'
import StandardLibraryIndexRedirect from '@/pages/standard-library'
import StandardLibraryLayout from '@/pages/standard-library/Layout'
import StandardLibraryLineagePage from '@/pages/standard-library/lineage'
import StandardLibraryRegistryPage from '@/pages/standard-library/standards'
import StandardLibraryTaxonomyPage from '@/pages/standard-library/taxonomy'
import SystemPage from '@/pages/system'
import TemplateArchivePage from '@/pages/template-archive'

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
          { path: 'taxonomy', element: <StandardLibraryTaxonomyPage /> },
        ],
      },
      {
        path: 'novelty-search',
        element: <NoveltySearchLayout />,
        children: [
          { index: true, element: <NoveltyTaskListPage /> },
          { path: 'create', element: <NoveltyCreateTaskPage /> },
          { path: 'tasks/:taskId', element: <TaskDetailPage /> },
        ],
      },
      { path: 'duplicate-check', element: <DuplicateCheckPage /> },
      { path: 'compliance', element: <CompliancePage /> },
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
      { path: 'system', element: <SystemPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])
