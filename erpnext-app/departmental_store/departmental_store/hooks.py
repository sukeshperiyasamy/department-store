app_name = "departmental_store"
app_title = "Departmental Store"
app_publisher = "Sukesh Periyasamy"
app_description = "Departmental store POS sync, idempotent sale submission and device management"
app_email = "sukeshperiyasamy@users.noreply.github.com"
app_license = "mit"

after_install = "departmental_store.install.after_install"

# API version advertised to clients; POS validates it before submitting.
API_VERSION = 1

SUPPORTED_API_VERSIONS = [1]

# Error codes returned by departmental_store.api.sales.submit_pos_sale.
# Documented in docs/api-contracts.md; do not rename without a contract version bump.
ERROR_ITEM_NOT_FOUND = "ITEM_NOT_FOUND"
ERROR_ITEM_DISABLED = "ITEM_DISABLED"
ERROR_PRICE_MISSING = "PRICE_MISSING"
ERROR_BATCH_INVALID = "BATCH_INVALID"
ERROR_PAYMENT_SHORTFALL = "PAYMENT_SHORTFALL"
ERROR_RATE_OVERRIDE_DENIED = "RATE_OVERRIDE_DENIED"
ERROR_REQUIRES_POS_PROFILE = "REQUIRES_POS_PROFILE"
ERROR_VALIDATION_FAILED = "VALIDATION_FAILED"
ERROR_DEVICE_UNKNOWN = "DEVICE_UNKNOWN"
ERROR_DEVICE_DISABLED = "DEVICE_DISABLED"
ERROR_INVOICE_POSTING_FAILED = "INVOICE_POSTING_FAILED"
