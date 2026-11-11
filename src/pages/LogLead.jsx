import LeadForm from '../components/LeadForm.jsx';
import { PageTitle, useToast } from '../components/ui.jsx';

export default function LogLead() {
  const toast = useToast();
  return (
    <div className="pb-20 md:pb-0">
      <PageTitle>Log a lead</PageTitle>
      <LeadForm onSaved={() => toast('Lead saved')} />
    </div>
  );
}
