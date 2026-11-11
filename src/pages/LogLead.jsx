import { toast } from 'sonner';
import LeadForm from '@/components/LeadForm.jsx';
import { PageHeader } from '@/components/app.jsx';
import { greeting } from '@/lib/format.js';
import { useSession } from '@/session.jsx';

export default function LogLead() {
  const { role } = useSession();
  return (
    <div className="pb-20 md:pb-0">
      <PageHeader
        eyebrow={role === 'staff' ? greeting() : 'New lead'}
        title={
          <>
            Log a <em>lead</em>
          </>
        }
        description="Every WhatsApp enquiry, even the ones that don't buy."
      />
      <LeadForm onSaved={(lead) => toast.success(`${lead.customer_name} saved`)} />
    </div>
  );
}
