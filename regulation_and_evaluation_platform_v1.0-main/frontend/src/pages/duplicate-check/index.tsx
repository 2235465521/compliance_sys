import { DuplicateCheckForm } from './components/DuplicateCheckForm'
import { DuplicateCheckReportModal } from './components/DuplicateCheckReportModal'
import { DuplicateCheckResultTable } from './components/DuplicateCheckResultTable'
import { DuplicateCheckSummaryCard } from './components/DuplicateCheckSummaryCard'

export default function DuplicateCheckPage() {
  return (
    <div className="dupcheck-page">
      <DuplicateCheckForm />
      <DuplicateCheckSummaryCard />
      <DuplicateCheckResultTable />
      <DuplicateCheckReportModal />
    </div>
  )
}
