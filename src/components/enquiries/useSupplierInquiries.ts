// Loads the enquiries the signed-in supplier (or admin) may see. The portals
// call this so the Enquiries tab can show an unread count.

import { useCallback, useEffect, useState } from "react";
import { listSupplierInquiries, type Inquiry } from "../../lib/inquiries";

export function useSupplierInquiries() {
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(() =>
    listSupplierInquiries()
      .then((l) => { setInquiries(l); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e))), []);
  useEffect(() => { reload(); }, [reload]);
  return { inquiries, error, reload };
}
