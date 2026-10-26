from datetime import timedelta

import frappe
from frappe.model.document import Document
from frappe.utils import add_to_date, get_datetime, now_datetime

# A claim older than this is considered abandoned (server crashed mid-posting).
PROCESSING_STALE_MINUTES = 15


class POSSaleSyncLog(Document):
    def is_stale_processing(self) -> bool:
        if self.status != "Processing":
            return False
        first = get_datetime(self.first_received_at) if self.first_received_at else None
        if not first:
            return True
        return first < add_to_date(now_datetime(), minutes=-PROCESSING_STALE_MINUTES)
