import frappe
from frappe.model.document import Document


class POSDevice(Document):
    def before_save(self):
        if self.has_value_changed("status") and self.status == "Disabled":
            frappe.logger("departmental_store").info(
                {"event": "device_disabled", "device_id": self.device_id, "user": frappe.session.user}
            )
