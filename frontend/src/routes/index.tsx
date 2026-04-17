import { createBrowserRouter, Navigate } from 'react-router-dom'
import BasicLayout from '@/layouts/BasicLayout'
import AlertPage from '@/pages/alert'
import CompliancePage from '@/pages/compliance'
import ComplianceWizardPage from '@/pages/compliance/wizard'
import DashboardPage from '@/pages/dashboard'
import EnterpriseArchivePage from '@/pages/enterprise-archive'
import DuplicateCheckPage from '@/pages/duplicate-check'
import NoveltySearchPage from '@/pages/novelty-search'
import StandardLibraryPage from '@/pages/standard-library'
import SystemPage from '@/pages/system'
import TemplateArchivePage from '@/pages/template-archive'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BasicLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'standard-library', element: <StandardLibraryPage /> },
      { path: 'novelty-search', element: <NoveltySearchPage /> },
      { path: 'duplicate-check', element: <DuplicateCheckPage /> },
      { path: 'compliance', element: <CompliancePage /> },
      { path: 'compliance/wizard', element: <ComplianceWizardPage /> },
      { path: 'alert', element: <AlertPage /> },
      { path: 'enterprise-archive', element: <EnterpriseArchivePage /> },
      { path: 'template-archive', element: <TemplateArchivePage /> },
      { path: 'system', element: <SystemPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
])
